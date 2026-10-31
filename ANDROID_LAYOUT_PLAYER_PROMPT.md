# Android player handoff: Canvas layouts

Copy the prompt below into the Android player project after updating its backend base URL and authentication setup. The server contract is implemented in this repository; the Android player source is separate.

---

Implement multi-zone Canvas layout playback in the Android digital signage player. Preserve existing full-screen playlist, ticker, schedule, offline cache, and proof-of-play behavior.

## Fetch and sync

- Use the paired device Bearer token for `POST /api/player/heartbeat` and `GET /api/player/sync`. Heartbeat returns `contentRevision`, `contentSource`, `playlistId`, `layoutId`, `syncRequired`, commands, `nextContentChangeAt`, and display config. Fetch `/sync` immediately on `FORCE_SYNC`, `syncRequired`, a changed revision, reconnect, or the scheduled content change timer; retain the server's periodic sync fallback. Do not poll `/sync-revision` when `revisionPollIntervalSeconds` is `0`.
- Send the last successfully applied `layoutVersion` in layout mode or `playlistVersion` in playlist mode. Also send `knownAssetIds` and `assetVersions` from the local file cache. Send `missingAssetIds` or `recoverCache=true` when a file is missing; the server will return a fresh signed `downloadUrl` even if the content version is unchanged.
- Treat every `/sync` response as the complete current playback state. `unchanged: true` still includes current zones/assets/tickers; process them. `layout == null` and `layoutVersion == null` mean leave layout mode. `playlist == null` and `layout == null` mean stop content playback and clear the old display. An active schedule has `contentSource: "schedule"` and replaces the entire manually assigned layout with a full-screen playlist; the layout returns when the schedule ends.
- In layout mode, `layout.zones` carries the render sequence and each zone's content. Top-level `assets[]` is the deduplicated union of files needed by all zones, for downloads and cache reporting; do not use it as a playback sequence. Keep duplicate playlist occurrences in each zone's `assets[]` and honor their `position` and nullable `durationSeconds` fields.
- Download required files into temporary paths, verify them, and atomically commit the new manifest and `layoutVersion` only when its required content is ready. Keep playing the last good offline manifest if a download or sync fails. Delete `removedAssetIds` only after a successful commit. Report successful cache state with `POST /api/player/cache-report`, including `currentLayoutId`, `currentLayoutName`, `layoutVersion`, deduplicated asset inventory, and zero pending downloads. Never acknowledge a layout version for a different layout ID.

## Display

- If `layout` is non-null, create one clipped view for each zone in a full-screen content container. Use the actual configured display orientation and viewport dimensions after system bars are hidden. Interpret `x`, `y`, `w`, and `h` as percentages: pixel bounds are `viewportWidth * x/100`, `viewportHeight * y/100`, `viewportWidth * w/100`, and `viewportHeight * h/100`. Sort by ascending `zIndex` and draw higher layers over lower ones. Recalculate bounds when orientation or display size changes. The backend only assigns layouts whose portrait or landscape resolution matches the device orientation; 1080p versus 4K does not change the percentage math.
- `PLAYLIST`: play `zone.assets[]` in `position` order in an independent repeating loop for that zone. Each zone keeps its own playback timer and media view. A nullable duration uses the existing device default or video natural-end rules; a positive duration is a playlist override. Apply `display.stretchToFit` within the zone, not the full screen. Log proof of play with this zone's `playlistId` and `playlistName`.
- `IMAGE`: render `zone.asset` as a static image filling or fitting the zone according to `stretchToFit`. It does not advance on a timer. If the asset is null or unavailable, clear that zone and report the failure without crashing other zones.
- `TICKER`: render `zone.ticker` continuously inside the zone rectangle. The server selects the device's highest priority active ticker; `ticker: null` clears the zone. The zone rectangle sets its size, so do not apply the ticker's `heightPercent` a second time. When any ticker zone exists, root `tickers[]` is empty. When no ticker zone exists, root `tickers[]` retains the existing global overlay behavior; reserve its configured edge height and calculate layout zone percentages in the remaining content viewport.
- Ignore unknown legacy zone types safely. Do not render HTML or clock zones for this release.

## Acceptance checks

Verify that a same-ID layout edit refreshes geometry and zone content; an image used by two zones downloads once but renders twice; a playlist zone can contain repeated occurrences of the same asset; ticker removal clears its zone; a missing cached file is recovered without changing `layoutVersion`; portrait and landscape bounds scale correctly; schedule start and end switch between full-screen playlist and layout; and layout unassignment clears all old zone views.

---
