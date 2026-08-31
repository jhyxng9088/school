# S-Hub data architecture v1

## Goal

Reduce Firestore quota pressure without removing or delaying user-visible core behavior.

Non-negotiable realtime behavior:
- class reminders update immediately after a student edit
- shared timetable updates immediately after a student edit
- shared academic schedules update immediately after a student edit
- online class presence remains live
- unread indicators continue to react to the same underlying changes

## Current target split

| Domain | Primary store / transport | Realtime behavior | Notes |
| --- | --- | --- | --- |
| Firebase authentication | Firebase Auth | session realtime | Keep existing identity and login flow. |
| Push delivery | FCM + existing scheduler backend | push | Keep existing reminder notification behavior. |
| Class reminders | Firestore | `onSnapshot` | Keep realtime; remove duplicate focus/server re-reads. |
| Reminder categories | Firestore | `onSnapshot` | Keep class-scoped realtime. |
| Personal reminder state | Firestore | `onSnapshot` | Keep realtime; reuse same snapshot for unread state. |
| Shared timetable | Firestore | `onSnapshot` | Optimistic local edit, then server confirmation; no extra activity-triggered refetch. |
| Shared academic schedules | Firestore | `onSnapshot` | Keep realtime; no per-device periodic full cleanup scan. |
| Activity attribution | Firestore | `onSnapshot` | Keep one listener; share result with unread logic. |
| Online presence | Firebase Realtime Database | RTDB presence | `onDisconnect()` cleanup; Firestore fallback remains until migration is proven. |
| Member total | Firestore + local cache | slow-changing | Cache count for 30 minutes instead of recounting each presence heartbeat. |
| Unread navigation indicators | in-memory scoped bus | same-frame | Reuse the app's existing realtime snapshots instead of opening duplicate Firestore listeners. |
| NEIS / meals | existing server/browser cache | refresh when source changes | Do not turn public source data into a Firestore realtime feed. |
| Future board/comments/reactions | Supabase Postgres | Supabase Realtime where needed | New feature domain; do not add it to Firestore by default. |
| Future study sessions/stats/rankings | Supabase Postgres | selective realtime | SQL aggregation is a better fit than repeated Firestore client scans. |

## Phase 1: Firestore read deduplication

The app continues to use the same Firestore documents and realtime listeners. The build removes redundant server reads that were layered on top of those listeners:

1. Do not run `getDocsFromServer` again on every focus/online event for reminders, categories, personal todo state, activity, or academics when the corresponding `onSnapshot` is already authoritative.
2. Do not refetch the timetable after an activity event or immediately after saving an override. The timetable listener already confirms the shared value.
3. Publish the app's existing realtime snapshots into an in-memory class/student-scoped bus.
4. Make unread indicators consume that bus rather than creating five additional Firestore realtime listeners.
5. Stop every client from full-scanning `academicEvents` on a timer simply to delete expired documents. The UI already excludes expired schedules. Physical cleanup can be centralized later.

No class reminder, timetable, or academic realtime listener is removed.

## Phase 2: Presence split

When `VITE_FIREBASE_DATABASE_URL` is configured:

- online presence is stored at `presence/{classId}/{firebaseUid}`
- payload contains only `connectedAt`
- `.info/connected` is used to detect RTDB connectivity
- `onDisconnect(...).remove()` clears presence after disconnect
- hidden/visible transitions explicitly leave/re-enter
- online count comes from the class RTDB presence node

If RTDB is missing, invalid, denied by rules, or fails at runtime, the app automatically activates the existing Firestore presence path.

Firestore fallback is also cheaper than before:
- heartbeat / online recount: 30 seconds instead of 15 seconds
- total class member count: cached for 30 minutes

The Firestore member registration/count path runs best-effort in parallel and is not allowed to block RTDB online presence during a Firestore quota outage.

## RTDB security design

Prepared `database.rules.json`:
- root read/write denied
- presence reads require Firebase authentication
- a user can write/delete only the child whose key equals their Firebase `auth.uid`
- only the numeric `connectedAt` field is accepted
- student name, number, class profile, and hashed student key are not written to RTDB presence

The rules are intentionally not wired into `firebase.json` until a Realtime Database instance actually exists.

## Phase 3: Supabase boundary

Create a dedicated S-Hub Supabase project; do not reuse the Memory Orb project.

New high-growth relational features should start there rather than being written to Firestore and migrated later:
- board posts
- comments
- reactions
- study sessions
- daily/weekly study aggregates
- class leaderboards / statistics

Existing reminders/timetable/academic schedules should not be moved in the first migration. They already have mature realtime, AI, attachment, notification, conflict, and cache behavior; changing their storage at the same time would add migration risk without being required to solve the current quota issue.

Firebase Auth can remain the identity provider. Supabase supports Firebase Auth as third-party authentication, but its role/RLS setup must be completed before any student data is stored there.

## Promotion rule

Do not promote this branch to `main` until:
1. all automated app/build/backend tests pass
2. Realtime Database is created and its exact URL is known
3. RTDB rules are deployed/tested
4. presence is tested on at least two clients, including disconnect/reconnect
5. Firestore fallback is deliberately tested
6. production-vs-branch diff contains no unrelated feature removals
7. the user explicitly approves production promotion
