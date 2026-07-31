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
All `/api/members*` and `/api/birthdays*` routes require a signed-in user. Log in or register first,
then send the returned `token` as `Authorization: Bearer <token>` on every subsequent request.

| Method | Path | Description |
|---|---|---|
| POST | /api/auth/register | Create an admin account `{ fullName, email, password }` -> returns `{ token, user }` |
| POST | /api/auth/login | `{ email, password }` -> returns `{ token, user }` |
| GET | /api/auth/me | Current user's profile (requires Bearer token) |
| POST | /api/auth/forgot-password | `{ email }` -> emails a 6-digit reset code if the account exists |
| POST | /api/auth/reset-password | `{ email, code, newPassword }` -> sets a new password |

## Member endpoints (all require `Authorization: Bearer <token>`)
| Method | Path | Description |
|---|---|---|
| GET | /api/members | List members (add `?q=search` to search by name/email/phone) |
| POST | /api/members | Create member `{ fullName, phoneNumber, address, dateOfBirth (YYYY-MM-DD), gmail }` |
| GET | /api/members/:id | Get one member |
| PUT | /api/members/:id | Update member |
| DELETE | /api/members/:id | Delete member |
| GET | /api/birthdays/today | Members with a birthday today |
| GET | /api/cron/birthday-check | Sends birthday emails to today's birthdays (requires `Authorization: Bearer <CRON_SECRET>`, separate from user auth) |
