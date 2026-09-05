# Move SafeGo to your own Supabase account

This is a supported, guided migration. It runs in three stages: you create the new project and hand over its keys, everything (schema, data, files, accounts) is copied across, then the app is re-pointed at your project and verified.

## Stage 1 — Credentials (provided, verified reachable)

Your new project (`ziipqtvsvcnrsaonbkoe`) is live and its keys are recognized. Provided:

- Project URL and publishable key — will go into the app's environment config (safe to be public).
- Secret key (`sb_secret_...`) — used as the service-role key; stored only in the secure secret store, never in code.
- Database connection string — used once to load schema and data.

Security note: the secret key and database password were pasted into chat, so after the migration completes, reset the database password (Settings > Database) and roll the secret key (Settings > API) in your Supabase dashboard. The app will be updated to the new values at that point.

## Stage 2 — Moving everything safely, nothing lost

Order matters, and nothing is deleted from the current backend at any point — it stays intact as a fallback until you confirm the new one works.

1. Schema: all 16 tables, the 3 custom types (roles, alert types, zone types), all 11 database functions, all triggers, and every access rule are recreated from the project's existing migration history (17 migration files already in the repo), so the new database is structurally identical.
2. User accounts: exported from the current auth store and imported with their existing ids and password hashes, so people keep their logins. Sign-in providers (email, Google) are re-enabled on the new project — Google needs its client id/secret added there.
3. Table data: exported and re-imported in dependency order (profiles and roles first, then groups, tours, alerts, sessions), preserving all ids so photos, group membership, likes, comments and ratings stay linked.
4. Files: both storage buckets are recreated with the same names and public/private settings (`tour-photos` public, `lost-photos` private) and all uploaded photos are copied over, then their access rules re-applied.
5. Verification: row counts per table are compared old vs new, and a checklist of key flows is run.

## Stage 3 — Changes in the app

- The backend address and public key in the environment config are swapped to your project; the secret keys move into the secret store.
- The AI features (safety chat, tour suggestions) currently use Lovable's built-in AI key. On your own backend, the two AI functions are redeployed to your project, and you either supply your own Google/Gemini API key or keep using the Lovable key value.
- Realtime is re-enabled for the tables that need it (live member locations, alerts, group updates) — without this, live tracking and separation alerts go quiet.
- No feature code needs rewriting: every screen talks to the backend through one shared client file, so re-pointing that is enough.

## Important trade-offs to know before approving

- Backend changes after the switch are made through your own Supabase dashboard/SQL rather than the in-app migration approvals.
- Lovable Cloud cannot be removed from this project afterwards; it simply stops being used.
- Plan on a short window where you avoid writing new data, so the copy is a clean snapshot.

## Technical notes

- Migration is driven with the managed migration lifecycle (start_migration → record_migration_complete) so the switch is tracked and reversible.
- Auth users move via `auth.users` export/import with `encrypted_password` preserved; `handle_new_user` trigger is recreated but only fires for future signups.
- Data load order follows the FK graph: `profiles`, `user_roles` → `tour_groups`, `shared_tours` → `tour_group_members`, `member_locations`, `shared_tour_*`, `group_join_requests` → `sos_alerts`, `zones`, `lost_reports`, `separation_alerts`, `emergency_sessions`.
- Every `CREATE TABLE` keeps its `GRANT` block for `authenticated`/`service_role` (and `anon` where public reads exist) — otherwise the API returns permission errors even with policies in place.
- Storage objects are copied bucket-by-bucket with paths preserved so stored URLs in `shared_tours.images`, `tour_groups.cover_image` and `lost_reports.photo_url` keep resolving.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_*` equivalents updated; `SUPABASE_SERVICE_ROLE_KEY` rebound server-side only.

## Step order

1. You create the project and provide keys.
2. Schema + functions + triggers + policies applied to your project.
3. Auth users imported, providers configured.
4. Table data imported, sequences/counters checked.
5. Buckets recreated, files copied, storage rules applied.
6. App re-pointed, realtime enabled, AI functions deployed.
7. Verification pass: sign in, create a group, join by code, upload a photo, trigger a test SOS, confirm live map updates.
