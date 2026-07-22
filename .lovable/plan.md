# SafeGo Production Hardening — Phased Roadmap

You selected **all four priority bundles**. That's ~4-6 turns of focused work. I'll ship them in the order below so each turn produces a working, testable app rather than a half-broken mega-diff. Existing schema, features, and architecture stay intact — every change layers on top.

---

## Turn 1 — Audit & Real-Logic Fixes (Phases 1 + 2)

**Correctness pass, no new surface area.** Highest-impact turn.

- **Auth**: verify session restore path, ensure `signOut` cancels queries + clears cache + `replace`-navigates, tighten protected-route redirects, kill any stale `getSession`/`getUser` mixups.
- **Tour planning**: confirm OSRM-only geometry everywhere (no straight-line fallbacks), stable stop IDs, orphan-segment pruning on reorder/delete, prevent realtime-listener state stomp (already fixed for groups — audit Discover creator too).
- **Live tracking**: add marker interpolation (smooth lerp between GPS pings), show heading/speed/accuracy/last-updated on member popups, dedupe subscriptions, throttle writes to `member_locations`.
- **Groups**: verify invite → join-request → approval → membership → realtime sync end-to-end; fix any RLS gaps surfaced by the audit.
- **Safety zones**: on every location tick, run enter/exit detection, fire notification, persist history row (add `zone_events` if missing).
- **SOS hardening**: replace instant-fire with **3-second press-and-hold** + haptic confirmation + countdown-to-cancel.
- **General**: hunt dead code, duplicate fetchers, missing `useEffect` cleanup, missing error boundaries on routes with loaders.

**Deliverable**: everything that exists today works correctly and defensively.

---

## Turn 2 — One-Tap Emergency Center (Phase 5)

- Floating SOS FAB visible across authenticated routes (respects Live Mode).
- Full-screen `/tourist/emergency` route: big hold-to-activate button, countdown, live map, address (reverse geocode), coordinates, trip context (destination/ETA/route), battery %, network status, GPS accuracy, nearby group members, quick-dial cards (Police 100 / Ambulance 108 / Fire 101 — India defaults, configurable).
- **Public tracking link** (`/track/{sessionId}`) — read-only page showing live location + trip info, powered by a new `emergency_sessions` table. Copy/native-share buttons.
- Session auto-refreshes location every 10 s while active, ends on user cancel.

**New table**: `emergency_sessions` (id, user_id, started_at, ended_at, share_token, last_lat, last_lng, battery, speed, trip_snapshot jsonb) + RLS (owner writes, `share_token` grants anon read of safe columns via RPC).

---

## Turn 3 — Welcome Redesign + UI Polish (Phases 6 + 7)

- Full-viewport hero with rotating high-res travel wallpapers (mountains / beach / forest / waterfall / road-trip / night-sky), Ken Burns zoom, gradient overlay, per-slide adaptive headline+CTA, indicators + manual controls.
- Glassmorphism quick-action panel: Plan Trip · Explore · Nearby · Group Tours · Emergency.
- Sitewide polish: consistent card/shadow/radius tokens, skeleton loaders, empty states, animated route transitions, dashboard visual refresh, better mobile bottom-nav spacing.

Landing page kept SEO-friendly (unchanged head metadata, semantic H1).

---

## Turn 4 — Offline Maps + Notification Center (Phases 3 + 4)

- **Offline tiles**: IndexedDB store, "Download current view" and "Download tour route" with size estimate + 200 MB cap, manage/delete downloaded regions, custom Leaflet tile layer that reads IDB first then network. Auto-detect `navigator.onLine`, show "Offline" banner, keep GPS + zones + downloaded POIs working. On reconnect: sync queued incident reports, show "Back Online" toast.
- **Notification center**: bell in header with unread badge, slide-out panel, animated cards (icon + title + desc + action + timestamp + priority color). Categories: Safety, Weather, Incidents, Travel, System. Backed by a new `notifications` table + realtime subscription. Existing zone/separation/SOS events pipe into it.

---

## Deferred (call out later if wanted)

- **Phase 8 map upgrades** beyond what Turn 1 already touches (clustering, traffic/weather overlays).
- **Phase 9 AI expansion** (weather-aware planning, unsafe-area warnings).
- **Phase 10 perf pass** (Lighthouse ≥95 targets — needs a dedicated turn after feature work settles).
- **Real SMS/WhatsApp** for emergency contacts (per your answer: link-only for now).

---

## Ground rules for every turn

1. No schema deletions. Only additive migrations, each with GRANTs + RLS.
2. Semantic tokens only — no hard-coded colors.
3. Every new route: unique `head()`, error + not-found boundaries.
4. Every new realtime channel: cleanup on unmount.
5. After each turn: quick smoke-test via preview, then hand back for you to try.

---

**Reply "go" and I'll start Turn 1 (Audit & Fixes).** If you want to reorder turns or drop one, tell me now.