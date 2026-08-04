# Church Member Management — Backend (Next.js + MongoDB)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `MONGODB_URI` — your MongoDB Atlas connection string
   - `CHURCH_NAME`
   - `GMAIL_USER` / `GMAIL_APP_PASSWORD` — a Gmail account with an [App Password](https://support.google.com/accounts/answer/185833) for sending birthday emails
   - `CRON_SECRET` — any random string, used to protect the cron endpoint
3. `npm run dev` — runs at http://localhost:3000

## Deploy (Vercel recommended)

1. Push this folder to a GitHub repo, import into Vercel.
2. Add the same env vars in Vercel's Project Settings → Environment Variables.
3. `vercel.json` already schedules `/api/cron/birthday-check` daily at 08:00 UTC via Vercel Cron — adjust the schedule/timezone as needed (Vercel Cron runs in UTC, so offset for your local 8 AM).

## Authentication

All `/api/members*` and `/api/birthdays*` routes require a signed-in, **approved** user. Log in or register first,
then send the returned `token` as `Authorization: Bearer <token>` on every subsequent request.

| Method | Path                      | Description                                                                           |
| ------ | ------------------------- | ------------------------------------------------------------------------------------- |
| POST   | /api/auth/register        | Create an admin account `{ fullName, email, password }` -> returns `{ token, user }`  |
| POST   | /api/auth/login           | `{ email, password }` -> returns `{ token, user }`                                    |
| GET    | /api/auth/me              | Current user's profile (requires Bearer token)                                        |
| POST   | /api/auth/forgot-password | `{ email }` -> emails a 6-digit reset code if the account exists                      |
| POST   | /api/auth/reset-password  | `{ email, code, newPassword }` -> sets a new password                                 |
| POST   | /api/auth/web-login       | Dashboard login — validates `{ email, password }` and sets an httpOnly session cookie |
| POST   | /api/auth/web-logout      | Clears the dashboard session cookie                                                   |

## Member endpoints (all require an approved account)

| Method | Path                     | Description                                                                                                          |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/members             | List members (add `?q=search` to search by name/email/phone)                                                         |
| POST   | /api/members             | Create member `{ fullName, phoneNumber, address, dateOfBirth (YYYY-MM-DD), gmail }`                                  |
| GET    | /api/members/:id         | Get one member                                                                                                       |
| PUT    | /api/members/:id         | Update member                                                                                                        |
| DELETE | /api/members/:id         | Delete member                                                                                                        |
| GET    | /api/birthdays/today     | Members with a birthday today                                                                                        |
| GET    | /api/cron/birthday-check | Sends birthday emails to today's birthdays (requires `Authorization: Bearer <CRON_SECRET>`, separate from user auth) |
| GET    | /api/activity            | Activity/audit feed `?action=&q=&actorId=&from=&to=&page=&limit=` (requires admin Bearer token)                      |

## User / approval endpoints (require an approved admin Bearer token)

| Method | Path                   | Description                        |
| ------ | ---------------------- | ---------------------------------- |
| GET    | /api/users             | List users, filter with `?status=` |
| GET    | /api/users/pending     | List accounts awaiting approval    |
| POST   | /api/users/:id/approve | Approve a pending account          |
| POST   | /api/users/:id/reject  | Reject a pending account           |

## Account approval

New accounts start as **`pending`** and cannot use the app until an approved admin
approves them. This keeps the platform to approved staff only.

- **Mobile app:** a pending user can sign in, but only sees a **"Pending Review"** screen
  (amber/orange icon) instead of the app. Once approved, the app unlocks on the next
  session load.
- **Web dashboard:** open **Users** in the sidebar to review pending accounts and
  Approve / Reject them. Both actions are written to the activity log.
- **API security:** pending/rejected accounts are blocked (403) from every data endpoint
  (`/api/members*`, `/api/birthdays*`, `/api/activity`, `/api/users*`) via `requireApprovedUser`.
- Existing accounts created before this feature were backfilled to **approved** in the DB.

## Activity Log (Admin Dashboard)

Every action below is automatically recorded in the `ActivityLog` collection: who did it,
when, and (for edits) exactly which fields changed.

| Recorded action       | Triggered by                                       |
| --------------------- | -------------------------------------------------- |
| `LOGIN`               | Any successful login (mobile app or dashboard)     |
| `MEMBER_CREATE`       | Creating a member                                  |
| `MEMBER_UPDATE`       | Editing a member (records the before → after diff) |
| `MEMBER_DELETE`       | Deleting a member                                  |
| `NOTIFICATION_RESEND` | Manually resending a birthday email                |
| `ACCOUNT_APPROVE`     | Admin approving an account                         |
| `ACCOUNT_REJECT`      | Admin rejecting an account                         |

The Next.js web dashboard has a **sidebar layout** with three menus:

- **Activity** — summary stats + a filterable/paginated activity table (by action, search, date range)
- **Members** — searchable member directory with birthday-email status
- **Users** — account management; pending accounts can be approved/rejected here

- **/login** — admin sign-in (sets an httpOnly `church_session` cookie; the mobile app is unaffected and keeps using Bearer tokens)

`/dashboard` is protected by `middleware.ts` and re-verifies the session JWT server-side; visiting it without a valid session redirects to `/login`.
