
This is a large multi-area request. I'll break it into focused, non-destructive phases. Working planner, routing, realtime, and Leaflet stay untouched.

## Phase 1 — Welcome page hero (`src/routes/index.tsx`)
- Add auto-rotating background slideshow (5 curated travel images, 5s interval, smooth cross-fade).
- Layered gradient + dark overlay behind hero text for guaranteed contrast.
- Stronger typographic hierarchy, premium feel, mobile-tuned spacing.
- Images: stock travel photos uploaded via `lovable-assets` (mountains, beach, heritage, scenic, city).

## Phase 2 — Group invite + approval system (CRITICAL)

### DB migration
- Add `group_code TEXT UNIQUE` to `tour_groups` (backfilled from `invite_code` with `SG-XXXXX` format).
- New table `group_join_requests` with `id, group_id, requester_id, requester_name, status (pending|approved|rejected), created_at, decided_at, decided_by`.
- RLS:
  - Requester can insert/select their own request.
  - Group creator (admin) can select/update requests for groups they own.
- GRANTs to authenticated + service_role.

### Routes
- New `src/routes/tourist.groups.join.$groupId.tsx` — public-ish join landing page:
  - Fetches group preview (name, cover, member count, creator, journey preview).
  - If already member → redirect into group.
  - If pending request → show "Pending admin approval".
  - Else → "Request to Join" / "Cancel" buttons.
- New `src/routes/tourist.groups.find.tsx` — Join-by-code page (search `SG-XXXXX`, preview, request join).
- Update `tourist.groups.index.tsx`:
  - "Join" dialog now routes to the find-by-code page.
  - Add "Copy invite link" helper using new `/tourist/groups/join/:id` URL.

### Group detail (`tourist.groups.$groupId.tsx`)
- Add "Join Requests" panel visible only to creator (admin).
- Approve → insert into `tour_group_members`, mark request approved.
- Reject → mark rejected.
- Show group_code prominently with copy button + shareable link.

## Phase 3 — Mobile-first + UX polish (light pass, no logic changes)
- Audit `tourist.groups.$groupId.tsx`, `tourist.discover.tsx`, `tourist.index.tsx` for mobile overflow; stack planner/map, larger touch targets (min 44px), collapsible sections where already present.
- Replace blank loading states with shadcn `Skeleton` blocks on Discover feed + Groups list + Group detail.
- Friendly empty states (icon + message + CTA) for: no groups, no discover results, no comments, no join requests.
- Consistent toast feedback for join request, copy invite, approve/reject, publish.

## Phase 4 — Safety net
- Keep ShareTourDialog working but switch its share link to `/tourist/groups/join/:id`.
- No changes to: routing engine, Leaflet maps, realtime member_locations, planner logic, Discover ↔ Group conversion.

## Technical notes
- Group code format: `SG-` + 5 uppercase alphanumerics, generated SQL-side via trigger using `upper(substring(md5(random()::text) from 1 for 5))` with uniqueness retry.
- Approval flow uses RLS, not edge functions — keeps stack simple.
- All new UI uses existing semantic tokens (no hardcoded colors).

## Out of scope (explicit)
- Push notifications (toasts only; in-app notification panel can come later).
- Email invites.
- Rewriting planner or map components.

Once you approve, I'll start with the DB migration (Phase 2 schema) since other code depends on it, then build the UI in parallel batches.
