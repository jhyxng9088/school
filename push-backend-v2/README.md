# S-Hub scheduled reminder backend v2

This backend is intentionally separate from the existing `school-push-backend`.
It only handles:

- reminder push 1 hour before a reminder with `dueTime`
- reminder preview at 23:00 KST on the previous day
- important academic schedule preview at 23:00 KST on the previous day

It does **not** replace the existing class-start, lunch, or activity push backend.

## Behavior

- completed reminders are excluded per student
- hidden/removed reminders are excluded per student
- reminders deleted from the shared class collection cannot be scheduled because they are not present in the source query
- only academic events whose stored `detail` begins with the S-Hub important marker are included
- 23:00 reminder previews are grouped per student
- multiple important academic events are grouped per class
- duplicate sends are prevented using Firestore-backed scheduled claims
- expired push subscriptions are deleted on 404/410 responses

## Required Vercel environment variables

- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase Admin service account JSON, stored only as a Vercel secret
- `VAPID_PRIVATE_KEY` — copy the private VAPID key used by the existing S-Hub push backend

Optional:

- `VAPID_PUBLIC_KEY` — defaults to the currently deployed S-Hub public key
- `VAPID_SUBJECT` — defaults to the S-Hub GitHub repository URL
- `CRON_SECRET` — if set, cron-job.org must send it using `X-Cron-Secret` or Bearer auth

Never commit any private key or service-account JSON to GitHub.

## Reminder edit activity endpoint

`POST /api/activity-dispatch` handles class reminder add/edit pushes. It verifies the actor against Firebase activity data, sends to the other students in the class, keeps `completed=true` students subscribed to edit activity, and suppresses every device for students whose personal reminder state has `hidden=true`.

## Endpoint

`GET /api/reminder-scheduled`

For a non-sending configuration check, use:

`GET /api/reminder-scheduled?dryRun=1`

Dry-run returns counts only. It does not create dedupe claims and does not send notifications.

## Cron

Run every 5 minutes, 24/7, Asia/Seoul:

`*/5 * * * *`

Keep the existing cron-job for `/api/push-scheduled`. After this backend is deployed and dry-run validated, add a second cron-job for `/api/reminder-scheduled`.

## Deployment note

After adding or changing Vercel environment variables, create a fresh production deployment so the new values are available to the function runtime.

The Hobby deployment is intentionally kept at 12 serverless functions. The legacy `/api/class-roster-repair` path is rewritten to the consolidated `class-roster` function so the public endpoint remains compatible without adding a thirteenth function.
