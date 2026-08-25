# Church Member Management — Backend (Next.js + MongoDB)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `MONGODB_URI` — your MongoDB Atlas connection string
   - `CHURCH_NAME`
   - `GMAIL_USER` / `GMAIL_APP_PASSWORD` — a Gmail account with an [App Password](https://support.google.com/accounts/answer/185833) for sending birthday emails
   - `CRON_SECRET` — any random string, used to protect the cron endpoint
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — only needed for post image/audio/video uploads (see "Media uploads" below)
3. `npm run dev` — runs at http://localhost:3000

## Deploy (Vercel recommended)

1. Push this folder to a GitHub repo, import into Vercel.
2. Add the same env vars in Vercel's Project Settings → Environment Variables.
3. `vercel.json` already schedules `/api/cron/birthday-check` daily at 08:00 UTC via Vercel Cron — adjust the schedule/timezone as needed (Vercel Cron runs in UTC, so offset for your local 8 AM).

### Public site URL for robots.txt / sitemap.xml (manual Vercel step)

`lib/site.ts` → `getSiteBaseUrl()` builds the URLs used by `app/robots.ts` and
`app/sitemap.ts`. It reads `NEXT_PUBLIC_BASE_URL` first, then falls back to
`VERCEL_PROJECT_PRODUCTION_URL` and finally a placeholder — so if you don't set
this var, those files silently point at the Vercel `*.vercel.app` URL instead of
your real domain.

**Set once in Vercel (dashboard/config action — no code change):**

1. Attach your custom domain to the project if you want it as the base:
   Vercel → project → Settings → Domains (e.g. `victoryandglorycenter.org`).
2. Settings → Environment Variables, add:
   - Key: `NEXT_PUBLIC_BASE_URL`
   - Value: `https://<your-real-domain>` (with scheme, **no trailing slash**, e.g. `https://victoryandglorycenter.org`)
   - Environment: **Production** (it is a build-time `NEXT_PUBLIC_*` value, so a redeploy is required for it to take effect)
3. Redeploy from the production branch.

**Verify after deploy:**

```bash
curl -s https://<your-real-domain>/robots.txt      # contains "Sitemap: https://<your-real-domain>/sitemap.xml"
curl -s https://<your-real-domain>/sitemap.xml      # every <loc> starts with https://<your-real-domain>/
```

### MongoDB indexes (run before every deploy)

`connectDB()` in [`lib/mongodb.ts`](./lib/mongodb.ts) runs with **`autoIndex: false`
in production**, so Mongoose does **not** auto-create schema-declared indexes on
connect there. Instead, indexes are built explicitly by the one-off script
[`scripts/create-indexes.js`](./scripts/create-indexes.js) as part of the deploy
(development still auto-builds them, so you rarely think about this locally).

**Every deploy must run** against the production database (with the production
`MONGODB_URI` in `backend/.env.local`), **before** deploying code that relies on
the index:

```bash
cd backend
npm run create:indexes
```

It is idempotent — re-running only creates indexes that don't already exist.

> **Future schema changes:** if you add an index to a model (`models/*.ts`),
> update the `INDEXES` map in `scripts/create-indexes.js` to match and run
> `npm run create:indexes` against production as part of that deploy. Missing
> this step is the most common way a new index silently never gets created.
> To force the opposite behavior in a given environment, set `AUTO_INDEX=true`
> or `AUTO_INDEX=false` (defaults: on for development, off for production).

## Media uploads (Cloudinary)

Post/event images and sermon audio/video are stored in [Cloudinary](https://cloudinary.com) and uploaded **directly from the client** — the raw file bytes never pass through a Vercel function (whose request bodies are capped at ~4.5MB, too small for sermon audio/video). Cloudinary handles CDN delivery and adaptive-bitrate streaming for sermon video playback.

Upload flow:

1. Admin client calls `POST /api/upload/signature` (Bearer token, admin/staff only) with an optional body `{ resourceType }` (`image | video | audio | raw | auto`, default `auto`). The backend returns signed params: `{ cloudName, apiKey, timestamp, folder, resourceType, signature }`.
2. The client uploads the file straight to Cloudinary:
   `POST https://api.cloudinary.com/v1_1/<cloudName>/<resourceType>/upload` (multipart: the file + the signed params).
3. Cloudinary returns `secure_url` — a CDN-backed public URL. The client stores it in `Post.imageUrl` / `Post.mediaUrl` via `POST` / `PUT /api/posts`, and in `Event.imageUrl` via `POST` / `PUT /api/events`. The mobile app renders/streams that URL directly.

**Large sermon video:** direct uploads are capped at 100MB. For bigger files, pass `{ chunkSize }` (5MB–90MB, e.g. `20971520` for 20MB) to `POST /api/upload/signature` — the response includes `chunked: true` and the client must use a chunked upload (Cloudinary reassembles the parts).

**Streaming playback:** when a sermon post stores a Cloudinary video URL with `mediaType: "video"`, the backend normalizes it to an adaptive HLS manifest (`.m3u8`, `sp_auto` streaming profile) before persisting. The mobile `expo-video` player streams it at multiple bitrates instead of downloading the whole `.mp4` — non-Cloudinary or non-video URLs pass through unchanged.

Required env vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (see `.env.example`). The API secret stays server-side — it only signs uploads and is never exposed to the client.

| Method | Path                  | Description                                                                   |
| ------ | --------------------- | ----------------------------------------------------------------------------- |
| POST   | /api/upload/signature | Return signed direct-upload params for Cloudinary (approved admin/staff only) |

## Feed post endpoints

Public read (no auth): `GET /api/posts` (paginated feed) and `GET /api/posts/:id`.
Write (approved admin/staff Bearer token):

| Method | Path           | Description                                                                           |
| ------ | -------------- | ------------------------------------------------------------------------------------- |
| POST   | /api/posts     | Create a post `{ type, title, body, imageUrl?, mediaUrl?, mediaType?, publishedAt? }` |
| PUT    | /api/posts/:id | Update a post (validates `imageUrl`/`mediaUrl` are public http(s) URLs)               |
| DELETE | /api/posts/:id | Delete a post                                                                         |

## Event endpoints

Public read (no auth): `GET /api/events` (paginated upcoming events) and `GET /api/events/:id`.
Write (approved admin/staff Bearer token):

| Method | Path                 | Description                                                                      |
| ------ | -------------------- | -------------------------------------------------------------------------------- |
| POST   | /api/events          | Create an event `{ title, description, location, startsAt, endsAt?, imageUrl? }` |
| PUT    | /api/events/:id      | Update an event (validates `imageUrl` is a public http(s) URL)                   |
| DELETE | /api/events/:id      | Delete an event                                                                  |
| POST   | /api/events/:id/rsvp | Public, no auth — `{ deviceId }`; idempotent, same device only counts once       |

## Prayer wall endpoints (public wall + moderation, DEV-22 / DEV-24 / DEV-29)

The public wall is unauthenticated. Reporting and device-level blocking were added in
DEV-29 for Play Store UGC policy compliance (see [`privacy/ugc-reporting-blocking.md`](../privacy/ugc-reporting-blocking.md)).

| Method | Path                             | Auth        | Description                                                                                                                                                             |
| ------ | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/prayer-requests             | Public      | Paginated public wall (`?page=&limit=`); hidden requests are excluded server-side                                                                                       |
| GET    | /api/prayer-requests/:id         | Public      | Single request; hidden requests return 404                                                                                                                              |
| POST   | /api/prayer-requests             | Public      | Submit a request `{ name?, message, deviceId? }` — `name` optional (anonymous); `deviceId` is the anonymous device id used for blocks (DEV-29). Blocked devices get 403 |
| POST   | /api/prayer-requests/:id/report  | Public      | Any user flags a request for admin review `{ deviceId, reason? }` (DEV-29). Idempotent per device; a device can't report its own request; blocked devices get 403       |
| POST   | /api/prayer-requests/:id/pray    | Public      | `{ deviceId }`; idempotent, same device only counts once; blocked devices get 403                                                                                       |
| PUT    | /api/prayer-requests/:id         | Admin/staff | Moderation — `{ hidden: boolean }` and/or `{ clearReports: true }` (DEV-29). Both are audited                                                                           |
| POST   | /api/prayer-requests/:id/block   | Admin/staff | DEV-29: block the submitting **device** (device-level blocking) + hide the request; audited                                                                             |
| POST   | /api/prayer-requests/:id/unblock | Admin/staff | DEV-29: remove the device block for the submitting device; audited                                                                                                      |
| DELETE | /api/prayer-requests/:id         | Admin/staff | Hard delete; audited                                                                                                                                                    |

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

## Push notifications (Expo Push, DEV-26)

The mobile app registers each device's Expo push token, and the backend fans
notifications out through https://exp.host/--/api/v2/push/send. Registration and
notification prefs are **per-device** (keyed by the stable `deviceId`), so every
install is covered — signed-in staff AND logged-out visitors.

Delivery respects the `notificationPrefs` toggles (DEV-13): `masterPushEnabled`
must be on, and a `category`-scoped send also requires that category's toggle to
be on. A device linked to a staff account (`userId` set on the Device doc) must
have the category ON in BOTH the device prefs and the account prefs to receive
it — the account-level pref is the master switch for staff devices.

| Method | Path                           | Description                                                                                                                             |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | /api/device/push-token         | Register/refresh a device `{ token, platform?, deviceId }` — **no auth** (works logged-out); links `userId` when a Bearer token is sent |
| DELETE | /api/device/push-token         | Unregister a device `{ token, deviceId }` (permission revoked)                                                                          |
| GET    | /api/device/notification-prefs | Read a device's prefs `?deviceId=` — no auth                                                                                            |
| PUT    | /api/device/notification-prefs | Update a device's prefs `{ deviceId, ...prefs }` — no auth                                                                              |
| POST   | /api/users/me/push-token       | Legacy signed-in registration (still supported; existing tokens keep delivering)                                                        |
| DELETE | /api/users/me/push-token       | Legacy signed-in unregister (logout / permission revoked)                                                                               |
| POST   | /api/notifications/send        | On-demand broadcast `{ title, body, category?, userIds?, data? }` (approved admin/staff)                                                |
| GET    | /api/notifications/send        | Scheduled cron job — weekly reminder via `PUSH_CRON_TITLE` / `PUSH_CRON_BODY` (requires `CRON_SECRET` header)                           |

Required env var for production sends: `EXPO_ACCESS_TOKEN` (see `.env.example`).
Scheduled cron is already wired in `vercel.json` (Mondays 09:00 UTC).

## Rate limiting on public writes (DEV-30)

> **Status:** Done — verified. DEV-30 is scoped to **rate limiting only**. The
> Play Console store listing that previously shared this number has been split out
> into its own checklist issue — see [`store-listing/README.md`](../store-listing/README.md).

Every **public** (no-auth) write endpoint is rate limited to protect against
spam and abuse. Public reads (e.g. `GET /api/posts`, `GET /api/events`) are not
limited — they are cheap and intended to be fetched freely.

The limiter lives in [`lib/rateLimit.ts`](./lib/rateLimit.ts) and stores a
fixed-window counter in MongoDB (the `RateLimit` collection) with a TTL index,
so it is consistent across all serverless instances and needs no Redis/Upstash.
A throttled request gets `429` with a `Retry-After` header.

| Endpoint                               | Key / scope               | Limit                                |
| -------------------------------------- | ------------------------- | ------------------------------------ |
| `POST /api/auth/register`              | per IP                    | 10 / hour                            |
| `POST /api/auth/login`                 | per IP                    | 20 / 15 min (brute-force protection) |
| `POST /api/auth/web-login`             | per IP                    | 20 / 15 min (brute-force protection) |
| `POST /api/auth/forgot-password`       | per IP                    | 5 / 15 min (reset-code email spam)   |
| `POST /api/auth/reset-password`        | per IP                    | 10 / 15 min (reset-code brute force) |
| `POST /api/prayer-requests`            | per IP                    | 10 / 10 min (wall spam)              |
| `POST /api/posts/:id/react`            | per device **and** per IP | 60 / min (device) · 240 / min (IP)   |
| `POST /api/prayer-requests/:id/pray`   | per device **and** per IP | 60 / min (device) · 240 / min (IP)   |
| `POST /api/prayer-requests/:id/report` | per device **and** per IP | 60 / min (device) · 240 / min (IP)   |
| `POST /api/events/:id/rsvp`            | per device **and** per IP | 60 / min (device) · 240 / min (IP)   |

The interaction endpoints (react / pray / rsvp) are already idempotent per
device — a device can only count once per target. The per-device + per-IP caps
stop a single device or a shared wifi IP from hammering many targets in a short
window.

Limits are configured in [`lib/rateLimit.ts`](./lib/rateLimit.ts) (`RATE_LIMITS`).
To tune them without editing code, they can be overridden via environment
variables — see `.env.example` for the names.

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

| Recorded action         | Triggered by                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `LOGIN`                 | Any successful login (mobile app or dashboard)                  |
| `MEMBER_CREATE`         | Creating a member                                               |
| `MEMBER_UPDATE`         | Editing a member (records the before → after diff)              |
| `MEMBER_DELETE`         | Deleting a member                                               |
| `NOTIFICATION_RESEND`   | Manually resending a birthday email                             |
| `ACCOUNT_APPROVE`       | Admin approving an account                                      |
| `ACCOUNT_REJECT`        | Admin rejecting an account                                      |
| `POST_CREATE`           | Creating a feed post (announcement / pastor's message / sermon) |
| `POST_UPDATE`           | Editing a feed post                                             |
| `POST_DELETE`           | Deleting a feed post                                            |
| `EVENT_CREATE`          | Creating an event                                               |
| `EVENT_UPDATE`          | Editing an event                                                |
| `EVENT_DELETE`          | Deleting an event                                               |
| `PRAYER_HIDE`           | Hiding a prayer request                                         |
| `PRAYER_UNHIDE`         | Un-hiding a prayer request                                      |
| `PRAYER_DELETE`         | Deleting a prayer request                                       |
| `PRAYER_BLOCK_DEVICE`   | Blocking a device from the prayer wall (and hiding its request) |
| `PRAYER_UNBLOCK_DEVICE` | Removing a device block from the prayer wall                    |
| `PRAYER_CLEAR_REPORTS`  | Clearing the reported flags on a reviewed request               |

The Next.js web dashboard has a **sidebar layout** with four menus:

- **Activity** — summary stats + a filterable/paginated activity table (by action, search, date range)
- **Members** — searchable member directory with birthday-email status
- **Users** — account management; pending accounts can be approved/rejected here
- **Prayer Requests** — moderation queue (DEV-24/DEV-29): user-reported requests are flagged
  for review; hide/un-hide, clear reports, block/unblock the submitting device, or delete

- **/login** — admin sign-in (sets an httpOnly `church_session` cookie; the mobile app is unaffected and keeps using Bearer tokens)

`/dashboard` is protected by `middleware.ts` and re-verifies the session JWT server-side; visiting it without a valid session redirects to `/login`.
