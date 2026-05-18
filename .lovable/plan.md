# Community Tour Posts + Social Discover

Extend the existing `shared_tours` system into a social-style travel feed with photos, likes, comments, saves, and a richer publish flow.

## Scope (what changes vs. current state)

The project already has:
- `shared_tours`, `shared_tour_ratings` tables
- `/tourist/discover` search by start+destination with radius/tags/duration filters
- `ShareTourDialog` to publish current group route
- "Use This Route" via `?applyTour=<id>` flow in group planner

What's missing (this plan adds it):
1. Photos on tour posts
2. Likes (replacing/augmenting ratings with simple ❤️)
3. Comments
4. Saves (bookmark for later)
5. Engagement counters on cards
6. Trending / Most-liked / Recent tabs on Discover
7. Tour detail page with full itinerary timeline + photo gallery
8. Richer publish dialog (photos, tips, per-stop description)

## Database (single migration)

```text
shared_tours: ADD
  creator_avatar text null
  images        text[] default '{}'
  tips          text   null
  likes_count   int    default 0
  comments_count int   default 0
  saves_count   int    default 0
  -- stops jsonb already exists; allow {name,lat,lng,description,order}

shared_tour_likes(id, tour_id, user_id unique(tour_id,user_id), created_at)
shared_tour_saves(id, tour_id, user_id unique(tour_id,user_id), created_at)
shared_tour_comments(id, tour_id, user_id, user_name, text, created_at)

Triggers: maintain likes_count / saves_count / comments_count on insert/delete.
RLS:
  likes/saves: auth read all; user insert/delete own
  comments:   auth read all; user insert own; user update/delete own
```

Storage bucket `tour-photos` (public read; authenticated users write to `{user_id}/...`).

## Frontend

### New files
- `src/components/TourPhotoUpload.tsx` — multi-image uploader → storage bucket, returns URLs
- `src/components/TourPostCard.tsx` — social-style card (avatar, title, photo carousel, mini-map, stats, like/comment/save/use buttons)
- `src/components/TourCommentsPanel.tsx` — list + add comments, realtime optional
- `src/routes/tourist.discover.$tourId.tsx` — full detail page: gallery, route on map, itinerary timeline, comments, actions

### Edited files
- `src/components/ShareTourDialog.tsx` — add photo upload, tips textarea, per-stop description input
- `src/routes/tourist.discover.tsx` — switch results to `TourPostCard`, add tabs: **For you / Trending / Most liked / Recent**, keep existing search+filters; sort by engagement when no search active
- `src/lib/polyline.ts` — already fine, reused

### Mechanics
- Like/Save: optimistic toggle, single row insert/delete; trigger updates counter
- Comments: paginated select, insert; soft-realtime via supabase channel on `shared_tour_comments`
- Share: `navigator.share` with link `/tourist/discover/<id>`; fallback copy to clipboard
- Use This Route: reuse existing `?applyTour=<id>` mechanism — link from card/detail navigates to a group selector or last opened group
- Trending = `likes_count + 2*saves_count` over last 14 days; Most liked = all-time `likes_count`; Recent = `created_at desc`

### Mobile-first
- Card is single column, full-width on `<sm`
- Sticky bottom action bar on detail page (Like / Save / Use Route)
- Photo carousel with swipe (embla via existing `ui/carousel`)
- Images lazy-loaded (`loading="lazy"`), polylines downsampled (already done)

## Out of scope (kept for later)
- Comment replies / comment likes (flat comments v1)
- Push notifications
- AI re-ordering of stops (existing AI suggest stays separate)
- Ratings UI is retained read-only; "like" becomes the primary engagement

## Approval
Reply **approve** to proceed, or tell me what to trim (e.g. skip comments, skip saves, defer detail page).
