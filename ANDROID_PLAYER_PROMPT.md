# Digital Signage Orion: Android Player & Secure Pairing Guide

This document provides a comprehensive, **production-ready** prompt for building the Android Player application, followed by the **exact API contracts** of the already-implemented NestJS backend. Hand this document to your AI assistant or Android developer — the backend is live and ready to accept requests.

---

## Part 1: Prompt for Building the Android Player

Copy the following text and provide it to your AI assistant or Android developer:

---
**Copy from here:**

**Objective:**
Build a robust, kiosk-mode Android application for a Digital Signage system ("Digital-Signage-Orion"). The app must run seamlessly on Android-based displays or TV boxes, fetching content from a NestJS backend and playing it in a continuous loop.

**Context:**
Our platform has a backend (NestJS) that manages `Organizations`, `Playlists`, `Layouts` (multi-zone screen designs), `Assets` (Images, Videos, Documents, URLs), and `Tickers` (scrolling text overlays). The backend API is already fully implemented and documented in detail below. The Android player will consume these APIs.

> **Note (architecture):** There is **no "Campaign" layer**. Playlists link **directly** to assets (`Playlist → PlaylistAsset → Asset`). A device can play either a **full-screen playlist** OR a **multi-zone layout** assigned from the CMS Layout Designer. When a layout is assigned, `/sync` returns zone geometry + per-zone content instead of a single full-screen playlist.

**Core Requirements:**

1.  **Tech Stack:**
    *   Language: Kotlin
    *   UI: Jetpack Compose (preferred) or XML Layouts.
    *   Media Playback: **ExoPlayer** for videos (gapless loop), **Coil/Glide** for images, **PdfRenderer** (or equivalent) for PDFs, Office/WebView rendering for DOC/DOCX/PPT/PPTX documents, and **WebView** for URL assets.
    *   Networking: **Retrofit** with OkHttp.
    *   Asynchronous Operations: **Kotlin Coroutines** and **Flows**.
    *   Dependency Injection: **Hilt**.
    *   Local Database: **Room** (for offline PoP log queue).

2.  **Kiosk Mode / Lock Down:**
    *   The app must act as a device owner or utilize `startLockTask()` to pin the app to the screen.
    *   It should automatically launch on device boot (using `RECEIVE_BOOT_COMPLETED`).
    *   Hide system UI (immersive full-screen mode).
    *   Keep the screen on at all times (`FLAG_KEEP_SCREEN_ON`).

3.  **Secure Pairing & Provisioning Flow:**
    *   On the very first launch, generate a **UUID** (`hardwareId`) and persist it.
    *   Call `POST /api/player/init-pairing` with the `hardwareId`. The backend returns a 6-character alphanumeric `pairingCode` and a `pairingSecret` (store both securely).
    *   Display the pairing code prominently on screen: _"Go to your Orion CMS dashboard, click **Add Device**, and enter code: **[CODE]**"_.
    *   **Background Polling:** Call `GET /api/player/pairing-status/{hardwareId}?pairingSecret={pairingSecret}` every 5 seconds (or send `X-Pairing-Secret` header). When `isPaired` becomes `true`, the response includes a `deviceToken`.
    *   Securely store the `deviceToken` and `organizationId` using **EncryptedSharedPreferences**.
    *   Transition to the Main Playback screen.

4.  **Content Management & Offline-First Support:**
    *   **Fetch Playlist:** Call `GET /api/player/sync` (authenticated with device token). Returns the active playlist manifest with pre-signed download URLs for each asset.
    *   **Download & Cache Assets:** Do NOT stream continuously. Download all assets to local storage on first sync. Use Android's `DownloadManager` or OkHttp streams to save to internal cache.
    *   **Playback Loop:** Once the manifest and files are cached, play them seamlessly in order based on `durationSeconds` and `position`.
    *   **Periodic Re-sync:** Poll `GET /api/player/sync-revision` every **5 seconds** (`revisionPollIntervalSeconds`). When `revision` changes or `syncRequired` is true, immediately call `GET /api/player/sync`. Also re-fetch the full manifest on the interval the server provides — heartbeat, sync, and device-report responses include `syncIntervalSeconds` (server-configurable, defaults to 120s / 2 minutes). Use that value only as a **fallback** full-sync timer, not as the primary change-detection path. Download only new/changed assets.
    *   **Offline Mode:** If the internet disconnects, continue looping cached content indefinitely until connection is restored.

5.  **Proof of Play (PoP) & Device Health:**
    *   Queue playback logs locally using **Room Database**: which asset played, when, and whether it succeeded.
    *   Sync PoP logs to the backend via `POST /api/player/pop-logs` every 5 minutes.
    *   Send heartbeats via `POST /api/player/heartbeat` every 60 seconds with CPU%, RAM%, temperature, and the currently playing asset name.

**Please start by doing the following:**
1. Generate the foundational project structure (Gradle configuration, manifest permissions for Boot/Internet/Wake Lock).
2. Create the `PairingScreen` UI (where the pairing code is displayed) and the `PlaybackScreen` UI.
3. Write the Retrofit API interface matching the exact contracts documented below.
4. Write the pairing service logic (Coroutine loop for polling pairing status).

---
**End Copy**

---

## Part 1B: Required Updates for an EXISTING Player (Backend Changes — June 2026)

> If you already have a working Android player built from an earlier version of this guide, hand the AI assistant / developer the copy-paste prompt below. It covers backend changes that affect the player: **campaign removal**, **asset folders**, **ticker `heightPercent`**, and **multi-zone layouts**.

---
**Copy from here:**

**Objective:** Update our existing Digital-Signage-Orion Android player to match recent backend changes. The pairing, sync, heartbeat, and PoP flows are unchanged in shape — only the details below change.

**1. Campaigns are gone (low effort):**
- The backend no longer has any "Campaign" concept. Playlists now link directly to assets.

**1C. CMS display settings (Stretch to Fit + Orientation + Playback Durations) — July/Aug 2026:**
- Heartbeat, device-report, and `/sync` responses now include a `display` object:
  ```json
  "display": {
    "orientation": "LANDSCAPE",
    "stretchToFit": false,
    "playback": { "imageDuration": 10, "videoDuration": 10, "documentDuration": 20, "urlDuration": 20 }
  }
  ```
- `orientation` is `LANDSCAPE` or `PORTRAIT`. Apply it to the playback surface immediately (no app restart).
- `stretchToFit: true` means every playlist asset must scale to fill the entire display (may crop / ignore aspect ratio). `false` means preserve aspect ratio (letterbox/pillarbox).
- Track `configVersion`. When it increases, re-apply `display` (and `features`) even if the playlist content is unchanged.
- Do **not** wait for a full content re-download to apply orientation, stretch, or playback duration changes.

**Two-level duration resolution — the player owns the final answer.**

The server sends two independent values and never merges them. Resolve in this order for every asset:

1. **Playlist override** — manifest `durationSeconds` is a positive integer → use it, whatever the device default says.
2. **Device default** — manifest `durationSeconds` is `null` → use `display.playback` for that asset type:

| Asset type | Device default field | Hard fallback if `playback` is missing |
| --- | --- | --- |
| `IMAGE` | `imageDuration` | 10 |
| `VIDEO` | `videoDuration` | 10 |
| `DOCUMENT` | `documentDuration` | 20 |
| `URL` | `urlDuration` | 20 |

`videoDuration` is new (Aug 2026). A `null` video duration previously meant "play to natural end"; it now means "use the device `videoDuration` default". A video whose natural length is shorter than the resolved duration should still advance when it ends rather than freeze on a black frame.

Never substitute a hardcoded `10` for a `null` playlist duration — `null` means *ask the device config*, and the device config is the only source for that number.

**Cache `null` as `null`.** When persisting the manifest to Room/JSON, `durationSeconds` must stay nullable end to end. Writing a resolved number into the cached manifest breaks the next device-default change, because the player would keep replaying a stale default that now looks like a playlist override.

**Re-resolve on config change, not on restart.** When `configVersion` increases and `display.playback` changes, recompute durations for the already-cached manifest in place. Assets with an explicit playlist duration must not shift; assets with `null` pick up the new default on their next turn in the loop. No restart, no re-download.

**Log every resolution** at asset start so the source is auditable:

```kotlin
Log.i("Playback", "asset=${asset.name} type=${asset.type} appliedDuration=${resolved}s source=$source")
// source = PLAYLIST_OVERRIDE when asset.durationSeconds != null, else DEVICE_DEFAULT
```
- In `POST /api/player/pop-logs`, the `campaignName` field is now **deprecated/optional**. Stop sending it (or send `null`). `assetName` + `playlistName` are all that's needed. Do **not** remove it from your data class if that breaks serialization — just leave it null.

**2. Asset folders (no player change):**
- The CMS can now group assets into nested folders, but this is purely organizational. The player still receives a flat ordered asset list from `/sync`. **No code change required.** (Mentioned only so you don't go looking for a folder field.)

**3. Tickers now use `heightPercent` instead of Small/Medium/Large (action required):**
- `GET /api/player/sync` returns a `tickers` array (sibling of `assets`). Render the **highest-priority** active ticker as a horizontally scrolling text bar over the playlist content.
- Each ticker object: `{ id, text, position, speed, heightPercent, style, textColor, backgroundColor, priority }`.
- **`heightPercent` is an integer (10–20)** = the percentage of the **screen height** the ticker bar occupies. Compute pixel height as `screenHeightPx * heightPercent / 100`. The playlist content area should fill the remaining `(100 − heightPercent)%` so content and ticker never overlap.
- `position` is `"TOP"` or `"BOTTOM"` (which edge the bar sits on).
- **If your current code uses a `height` enum (`SMALL`/`MEDIUM`/`LARGE`) with fixed pixel sizes, replace it** with the `heightPercent` calculation above. Remove the old enum.
- Other fields: `speed` (`"SLOW"|"NORMAL"|"FAST"` → constant scroll velocity: 45 / 85 / 150 px/sec), `style` (`"CLASSIC"|"NEON"|"GRADIENT"|"MINIMAL"` → visual theme), `textColor` & `backgroundColor` (hex strings), `priority` (`"LOW"|"NORMAL"|"URGENT"` — show the highest-priority active ticker).
- Scroll must be a **seamless continuous loop** (repeat the message with a ~56px gap), never static or single-pass. No badges — just scrolling text on the colored bar. This must look identical to the CMS preview.

**4. Multi-zone layouts (action required if supporting Layout Designer):**
- When a device has a layout assigned in CMS, `GET /api/player/sync` returns a `layout` object (with `layoutVersion`) instead of a flat full-screen playlist.
- Send `layoutVersion` on sync polls (same pattern as `playlistVersion`). Persist it after successful sync.
- `layout.zones` is an array of absolutely-positioned regions. Each zone has `x`, `y`, `w`, `h` as **percentages (0–100)** of the screen. Convert to pixels: `left = screenW * x/100`, etc.
- Zone types:
  - **`PLAYLIST`** — contains `assets[]` (same shape as flat sync assets). Run an independent playback loop inside the zone bounds.
  - **`TICKER`** — contains `ticker` object (same fields as global tickers). Render scrolling text **inside the zone rectangle** (not full-screen). When layout has ticker zones, global `tickers[]` is empty.
  - **`IMAGE`** — contains `asset` (single asset entry). Display static image/video in zone bounds.
  - **`HTML`** / **`CLOCK`** — reserved; render placeholder or WebView clock until implemented.
- Top-level `assets[]` is still returned as a **deduplicated flat list** of all assets across zones — use it for download/cache (same incremental sync with `knownAssetIds` / `assetVersions`).
- When `layout` is null, fall back to existing full-screen `playlist` + `tickers` behavior (backward compatible).

**Tasks:**
1. Add/replace a `TickerInfo` data class in the Retrofit layer (see Part 4) and add `tickers: List<TickerInfo>` to `SyncResponse`.
2. Add `layoutVersion`, `layout: LayoutInfo?` to `SyncResponse` plus `LayoutZoneInfo` data classes (see Part 4).
3. Update the playback screen: if `layout != null`, render zones; else full-screen playlist + ticker overlay.
4. Set `campaignName = null` in PoP log uploads.

---
**End Copy**

---

## Part 2: Live API Reference (Already Implemented ✅)

> **Base URL:** `http://<YOUR_SERVER>:3001/api`
>
> All endpoints below are **live and tested**. The backend code lives in `apps/api/src/player/`.

---

### 2.1 Pairing Endpoints (Public — No Auth Required)

#### `POST /api/player/init-pairing`

Called by the Android app on first boot. Creates a draft Device record and returns a pairing code.

**Request:**
```json
{
  "hardwareId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (200):**
```json
{
  "hardwareId": "550e8400-e29b-41d4-a716-446655440000",
  "isPaired": false,
  "pairingCode": "A3X9PZ",
  "pairingSecret": "a1b2c3d4e5f6..."
}
```

**Idempotent:** If the same `hardwareId` calls again, it returns the existing code and secret (won't create a duplicate). If already paired, returns `isPaired: true` without secrets.

---

#### `GET /api/player/pairing-status/:hardwareId`

Polled by the Android app every 5 seconds until pairing completes.

**Query param (required):** `pairingSecret` — from `init-pairing` response. Alternatively send header `X-Pairing-Secret`.

**Response (Unpaired):**
```json
{
  "isPaired": false,
  "deviceToken": null,
  "organizationId": null,
  "deviceName": null
}
```

**Response (Paired ✅):**
```json
{
  "isPaired": true,
  "deviceToken": "d0d7e397e6d1e943f8e11b3a14f9aec4c79ddb8ba97eaa321300c4581cd7840c",
  "organizationId": "cmo9wv2ml0001qvbyoga3bfp1",
  "deviceName": "Lobby Screen"
}
```

> **Important:** The `pairingSecret` prevents unauthorized token retrieval. Store both `deviceToken` and `pairingSecret` securely. All post-pair API calls use `deviceToken` in the `Authorization` header.

---

### 2.2 Authenticated Device Endpoints

> **Auth:** All endpoints below require the device token in the `Authorization` header:
> ```
> Authorization: Bearer <deviceToken>
> ```

---

#### `POST /api/player/heartbeat`

Send device health telemetry. Call every ~60 seconds.

**Request:**
```json
{
  "cpu": 35,
  "ram": 62,
  "temp": 42,
  "currentContent": "Summer Sale Campaign"
}
```
- `cpu`: integer 0–100 (CPU usage %)
- `ram`: integer 0–100 (memory usage %)
- `temp`: integer 0–120 (temperature in °C)
- `currentContent`: optional string — name of the currently playing asset

**Response (200):**
```json
{
  "status": "ok",
  "contentRevision": "pl:clxyz123:v3:1718712000000:tk1718712100000c1",
  "syncRequired": false,
  "syncIntervalSeconds": 120,
  "revisionPollIntervalSeconds": 5,
  "initialSyncPending": false,
  "initialSyncTimeoutSeconds": 120,
  "command": "FORCE_SYNC",
  "commandId": "cmd_abc123"
}
```

- `syncRequired`: `true` when the server has a newer playlist/layout version the device has not fully cached, or when ticker content changed since the last sync.
- `revisionPollIntervalSeconds`: how often to poll `GET /api/player/sync-revision` (default **5s**).
- `syncIntervalSeconds`: fallback full manifest poll interval (default **120s**).
- `initialSyncPending`: `true` for freshly paired devices that have not completed their first successful sync.
- `command` / `commandId`: optional cache command (`FORCE_SYNC`, `CLEAR_CACHE`, `REDOWNLOAD_PLAYLIST`). Execute immediately — do not wait for the next periodic sync timer.

---

#### `GET /api/player/sync-revision`

Lightweight revision check. Poll every `revisionPollIntervalSeconds` (default **5s**). When `revision` differs from the last stored value **or** `syncRequired` is `true`, immediately call `GET /api/player/sync`.

**Response (200):**
```json
{
  "revision": "pl:clxyz123:v3:1718712000000:tk1718712100000c1",
  "updatedAt": "2026-06-18T12:00:00.000Z",
  "syncRequired": true,
  "playlistVersion": 3,
  "layoutVersion": null,
  "contentType": "playlist",
  "playlistId": "clxyz123",
  "layoutId": null,
  "contentSource": "schedule",
  "activeSchedule": {
    "scheduleId": "clsch456",
    "scheduleName": "Morning Playlist",
    "playlistId": "clxyz123",
    "startDateTime": "2026-08-12T03:30:00.000Z",
    "endDateTime": "2026-08-12T07:30:00.000Z"
  },
  "initialSyncPending": false,
  "revisionPollIntervalSeconds": 5,
  "syncIntervalSeconds": 120
}
```

**Scheduling — the server already resolved it; the player does not.**

`playlistId` is the playlist this device should be playing *right now*. When a CMS
schedule is active, the server has already substituted the scheduled playlist here,
so the existing "revision changed → call `/sync`" loop is all the player needs. Do
not evaluate schedule windows on-device, and do not compare `startDateTime` /
`endDateTime` against the local clock to decide what to play — clock drift on the
device would fight the server.

| Field | Meaning |
| --- | --- |
| `activeSchedule` | The schedule currently driving this device, or `null` when none applies. |
| `contentSource` | `schedule`, `manual-playlist`, `manual-layout`, or `none` — why `playlistId` is what it is. |

Server-side priority is **active schedule → manually assigned playlist/layout → nothing**.
A schedule starting, ending, being edited, disabled or deleted all change `revision`,
so each is picked up within one poll (~5s) with no push required. When a schedule
ends, `playlistId` reverts to the device's manual assignment on its own.

`activeSchedule` is informational — useful for logs and diagnostics screens:

```kotlin
Log.i("Sync", "playlistId=${res.playlistId} source=${res.contentSource} " +
    "schedule=${res.activeSchedule?.scheduleName ?: "none"}")
```

`activeSchedule` and `contentSource` are also present on `GET /api/player/sync`.

---

#### `GET /api/player/sync`

Fetch the active playlist assigned to this device. Supports **incremental sync** so the player can skip full re-downloads when nothing changed.

**Query parameters (all optional):**

| Parameter | Description |
|-----------|-------------|
| `playlistVersion` | Last `playlistVersion` the player successfully cached |
| `layoutVersion` | Last `layoutVersion` the player successfully cached (when device uses a layout) |
| `knownAssetIds` | Comma-separated asset IDs currently on disk (used to detect removals) |
| `assetVersions` | Comma-separated `assetId:contentVersion` pairs for delta downloads |
| `recoverCache` | Set to `true` to force presigned download URLs for all file-based assets (cache recovery after reinstall or cleared storage) |
| `missingAssetIds` | Comma-separated asset IDs the player knows it is missing locally — always returns download URLs for these IDs |

**Example:** `GET /api/player/sync?layoutVersion=2&knownAssetIds=abc,def&assetVersions=abc:1,def:2&recoverCache=true`

Pre-signed S3 download URLs are valid for **7 days** (long enough for offline download windows between syncs).

> **Important:** The `assets[]` manifest is **always returned** when content is assigned, even when `unchanged: true`. Use `unchanged` as a hint that layout/playlist geometry and versions have not changed — not as a signal to skip reading `assets[]`. When local files are missing, send `recoverCache=true` or list IDs in `missingAssetIds` to receive fresh presigned URLs.

**Response (No playlist assigned):**
```json
{
  "unchanged": false,
  "playlistVersion": null,
  "playlist": null,
  "assets": [],
  "currentAssetIds": [],
  "removedAssetIds": ["abc", "def"]
}
```

**Response (Unchanged — playlist version matches):**
```json
{
  "unchanged": true,
  "playlistVersion": 3,
  "playlist": { "id": "clxyz123", "name": "Lobby Playlist" },
  "assets": [
    {
      "id": "abc",
      "name": "welcome-banner.jpg",
      "type": "IMAGE",
      "mimeType": "image/jpeg",
      "documentFormat": null,
      "durationSeconds": 10,
      "position": 0,
      "assetVersion": 2,
      "updatedAt": "2026-06-18T12:00:00.000Z",
      "contentHash": "d41d8cd98f00b204e9800998ecf8427e",
      "status": "READY",
      "available": true,
      "unavailableReason": null,
      "requiresDownload": false,
      "downloadUrl": null,
      "url": null,
      "fileSize": 245670
    }
  ],
  "currentAssetIds": ["abc", "def", "ghi"],
  "removedAssetIds": []
}
```

**Response (Updated playlist):**
```json
{
  "unchanged": false,
  "playlistVersion": 4,
  "playlist": {
    "id": "clxyz123",
    "name": "Lobby Playlist"
  },
  "currentAssetIds": ["abc", "def", "ghi"],
  "removedAssetIds": ["old-asset-id"],
  "assets": [
    {
      "id": "clxyz456",
      "name": "welcome-banner.jpg",
      "type": "IMAGE",
      "mimeType": "image/jpeg",
      "documentFormat": null,
      "durationSeconds": 10,
      "position": 0,
      "assetVersion": 2,
      "updatedAt": "2026-06-18T12:00:00.000Z",
      "contentHash": "d41d8cd98f00b204e9800998ecf8427e",
      "status": "READY",
      "available": true,
      "unavailableReason": null,
      "requiresDownload": true,
      "downloadUrl": "https://s3.ap-south-1.amazonaws.com/orion-assets/...",
      "url": null,
      "fileSize": 245670
    },
    {
      "id": "clxyz789",
      "name": "promo-video.mp4",
      "type": "VIDEO",
      "mimeType": "video/mp4",
      "documentFormat": null,
      "durationSeconds": null,
      "position": 1,
      "assetVersion": 1,
      "updatedAt": "2026-06-10T08:00:00.000Z",
      "contentHash": "abc123",
      "requiresDownload": false,
      "downloadUrl": null,
      "url": null,
      "fileSize": 15234567
    },
    {
      "id": "clxyz999",
      "name": "Weather Dashboard",
      "type": "URL",
      "mimeType": "text/uri-list",
      "documentFormat": null,
      "durationSeconds": 15,
      "position": 2,
      "assetVersion": 1,
      "updatedAt": "2026-06-01T00:00:00.000Z",
      "contentHash": null,
      "requiresDownload": false,
      "downloadUrl": null,
      "url": "https://weather.com",
      "fileSize": 0
    },
    {
      "id": "clxyzdoc",
      "name": "menu-board.pdf",
      "type": "DOCUMENT",
      "mimeType": "application/pdf",
      "documentFormat": "pdf",
      "durationSeconds": 20,
      "position": 3,
      "assetVersion": 1,
      "updatedAt": "2026-06-20T00:00:00.000Z",
      "contentHash": "pdfhash123",
      "status": "READY",
      "available": true,
      "unavailableReason": null,
      "requiresDownload": true,
      "downloadUrl": "https://s3.ap-south-1.amazonaws.com/orion-assets/...",
      "url": null,
      "fileSize": 890123
    }
  ],
  "tickers": [
    {
      "id": "ckt123",
      "text": "Welcome to our store — flash sale ends at 6 PM!",
      "position": "BOTTOM",
      "speed": "NORMAL",
      "heightPercent": 12,
      "style": "NEON",
      "textColor": "#00e5ff",
      "backgroundColor": "#1a1f2e",
      "priority": "URGENT"
    }
  ]
}
```

> The `tickers` array is returned on **every** `/sync` response (including `unchanged: true`), so the player always has the current ticker state. If empty, render no ticker bar and let playlist content use the full screen.

**Ticker rendering (must match the CMS preview exactly):**
1. Pick the **highest-`priority`** ticker (`URGENT` > `NORMAL` > `LOW`); the array is already sorted priority-desc.
2. The ticker bar occupies `screenHeightPx * heightPercent / 100` pixels on the `position` edge (`TOP`/`BOTTOM`); playlist content fills the remaining height (no overlap).
3. Scroll `text` **continuously right → left** at a **constant velocity** (the same px/sec regardless of text length):
   - `SLOW` = **45 px/sec**, `NORMAL` = **85 px/sec**, `FAST` = **150 px/sec**.
   - Loop **seamlessly**: repeat the message with a fixed gap (~56px) so the bar is never blank — when one copy scrolls off the left, the next is already entering from the right. Do not use a static or single-pass-then-jump animation.
4. Apply `textColor`, `backgroundColor`, and `style` (`CLASSIC`/`NEON`/`GRADIENT`/`MINIMAL`) for theming. No priority/position badge — just the scrolling text on the colored bar.
5. Tickers are independent of the playlist loop — keep the bar scrolling continuously across asset transitions.

**Layout mode (when device has a layout assigned):**

```json
{
  "unchanged": false,
  "layoutVersion": 2,
  "layout": {
    "id": "clayout123",
    "name": "Lobby Split Screen",
    "resolution": "LANDSCAPE_1080P",
    "zones": [
      {
        "id": "zone1",
        "name": "Center_Display",
        "type": "PLAYLIST",
        "x": 0, "y": 0, "w": 75, "h": 80,
        "zIndex": 0,
        "playlistId": "clxyz123",
        "playlistVersion": 4,
        "playlistName": "Main Loop",
        "assets": [ /* same asset entries as flat sync */ ]
      },
      {
        "id": "zone2",
        "name": "Bottom_Ticker",
        "type": "TICKER",
        "x": 0, "y": 80, "w": 100, "h": 20,
        "zIndex": 1,
        "ticker": {
          "id": "ckt123",
          "text": "Welcome!",
          "position": "BOTTOM",
          "speed": "NORMAL",
          "heightPercent": 12,
          "style": "NEON",
          "textColor": "#00e5ff",
          "backgroundColor": "#1a1f2e",
          "priority": "URGENT"
        }
      }
    ]
  },
  "playlistVersion": null,
  "playlist": null,
  "assets": [ /* deduplicated union of all zone assets */ ],
  "currentAssetIds": ["abc", "def"],
  "removedAssetIds": [],
  "tickers": []
}
```

**Layout rendering:**
1. If `layout != null`, use multi-zone mode. `playlist`/`playlistVersion` will be null.
2. Render each zone as an absolutely-positioned view using percent → pixel conversion.
3. Run independent content loops per `PLAYLIST` zone. Ticker zones scroll inside their bounds.
4. When `layout` has ticker zones, `tickers[]` at root is empty — use zone-level `ticker` objects.
5. When `layout` is null, use legacy full-screen playlist + optional global ticker overlay.

**Offline sync flow:**
1. Persist `playlistVersion` / `layoutVersion` and per-asset `assetVersion` + `contentHash` after a successful sync.
2. On each sync poll, send `playlistVersion` or `layoutVersion`, `knownAssetIds`, and `assetVersions`.
3. If `unchanged: true`, content geometry has not changed — still read `assets[]` to confirm local cache matches `requiresDownload: false` entries.
4. If local files are missing (fresh install, cleared cache, failed download), retry sync with `recoverCache=true` or `missingAssetIds=id1,id2` to receive presigned URLs even when versions match.
5. If `removedAssetIds` is non-empty, delete those local files **only after** a successful sync response.
6. Download only assets where `requiresDownload: true` and `available: true`.
7. When `available: false`, show a user-visible error using `unavailableReason` — do not attempt download.
8. Playback never requires live internet — only sync, heartbeat, and PoP upload use the network.

**Asset types:** `IMAGE`, `VIDEO`, `DOCUMENT`, `URL` only (HTML asset type is removed — do not render HTML as a playlist asset)

**Playback logic:**
1. Sort assets by `position` (already sorted in response)
2. Resolve each asset's play length (playlist override beats device default — see Part 1C):
   - If `durationSeconds` is a positive integer → play for that many seconds (`PLAYLIST_OVERRIDE`)
   - If `durationSeconds` is `null` → device default for the type (`DEVICE_DEFAULT`):
     - `IMAGE` → `display.playback.imageDuration` (fallback 10)
     - `VIDEO` → `display.playback.videoDuration` (fallback 10)
     - `DOCUMENT` → `display.playback.documentDuration` (fallback 20)
     - `URL` → `display.playback.urlDuration` (fallback 20)
3. For `IMAGE`: display using Glide/Coil for the resolved duration
4. For `VIDEO`: play using ExoPlayer for the resolved duration; advance early if the media ends first
5. For `DOCUMENT`:
   - Use local cached file (same download/cache path as IMAGE/VIDEO)
   - Prefer `documentFormat` (`pdf` | `doc` | `docx` | `ppt` | `pptx`; legacy may be `word` / `powerpoint`); fall back to `mimeType` / file extension
   - **PDF**: render pages clearly fullscreen (PdfRenderer / similar); respect resolved duration
   - **Office** (DOC, DOCX, PPT, PPTX): render with the existing Office/WebView conversion approach fullscreen; respect resolved duration
   - Never show a blank screen — if render fails, show a clear error placeholder and advance after duration
6. For `URL`: load `url` in a WebView for the resolved duration (no download/cache — `downloadUrl` is null)
7. Loop back to position 0 when the last asset finishes

**Document sync/cache (same as IMAGE/VIDEO):**
- `requiresDownload: true` → download to local cache
- If already cached with matching `assetVersion` / `contentHash` → do **not** re-download
- Work offline from cache
- Update when version/hash changes
- Delete when listed in `removedAssetIds`

**Cache commands (delivered on sync):**

When an administrator queues a cache action from the CMS, the next `/sync` response includes:

```json
{
  "cacheCommand": {
    "id": "cmd_abc123",
    "command": "FORCE_SYNC"
  }
}
```

Commands: `FORCE_SYNC`, `CLEAR_CACHE`, `REDOWNLOAD_PLAYLIST`. After executing, report completion via `POST /api/player/cache-report` with `completedCommandId` set.

---

#### `POST /api/player/cache-report`

Report offline cache inventory to the CMS. Call every **5 minutes**, after sync/download completes, and when a cache command finishes.

**Request:**
```json
{
  "currentPlaylistId": "pl_123",
  "currentPlaylistName": "Lobby Playlist",
  "playlistVersion": 4,
  "cacheTotalBytes": 524288000,
  "cacheUsedBytes": 318000000,
  "storageTotalBytes": 8589934592,
  "cachedAssetCount": 8,
  "expectedAssetCount": 8,
  "pendingDownloadCount": 0,
  "syncStatus": "OK",
  "lastSuccessfulSyncAt": "2026-06-29T08:15:00.000Z",
  "lastFailedSyncAt": null,
  "lastSyncError": null,
  "completedCommandId": "cmd_abc123",
  "commandFailed": false,
  "assets": [
    {
      "assetId": "asset_1",
      "assetName": "welcome-banner.jpg",
      "assetType": "IMAGE",
      "mimeType": "image/jpeg",
      "playlistId": "pl_123",
      "playlistName": "Lobby Playlist",
      "fileSize": 245670,
      "assetVersion": 2,
      "contentHash": "abc123",
      "downloadStatus": "DOWNLOADED",
      "localCacheStatus": "PRESENT",
      "downloadedAt": "2026-06-29T08:14:55.000Z"
    }
  ]
}
```

**Response:** `{ "received": true }`

`downloadStatus`: `DOWNLOADED` | `PENDING` | `FAILED`  
`localCacheStatus`: `PRESENT` | `MISSING` | `CORRUPT`  
`syncStatus`: `OK` | `PARTIAL` | `FAILED`

---

#### `POST /api/player/pop-logs`

Submit queued proof-of-play analytics. Call every ~5 minutes, or when the offline queue exceeds ~50 entries.

**Request:**
```json
{
  "logs": [
    {
      "assetName": "welcome-banner.jpg",
      "playlistName": "Lobby Playlist",
      "campaignName": "Spring Promo",
      "status": "VERIFIED",
      "startTime": "2026-04-22T10:30:00.000Z",
      "endTime": "2026-04-22T10:30:10.000Z",
      "durationSeconds": 10
    },
    {
      "content": "promo-video.mp4",
      "playlistName": "Lobby Playlist",
      "campaignName": "Spring Promo",
      "status": "VERIFIED",
      "timestamp": "2026-04-22T10:30:10.000Z",
      "durationSeconds": 30
    }
  ]
}
```
- `assetName` (preferred) or legacy `content`
- `playlistName`: optional context for reporting
- `campaignName`: **deprecated** — campaigns were removed. Send `null` or omit it; new logs no longer populate this field.
- `startTime` (preferred) or legacy `timestamp`
- `endTime`, `durationSeconds`: optional; server derives missing values when possible
- `status`: `"VERIFIED"` (played successfully) or `"FAILED"` (playback error)

**One entry per playback.** Send exactly one log for each time an asset finishes playing, with that play's own `startTime`. Never merge a loop into a single entry with a multiplied `durationSeconds` — the server stores what it receives and no longer splits merged entries, so merging under-reports the play count.

**Retries are safe.** `(device, assetName, startTime)` is the unique key of a playback event. If a flush times out and you resend the same queue entries, the server keeps the original rows and reports the resent ones as `duplicates`. Only delete entries from the Room queue after a 2xx response; resending is always preferable to dropping.

**Delayed / offline logs:** The server accepts logs with historical `startTime` values (e.g. generated days ago while offline). There is no maximum age — only timestamps more than 24 hours in the future are rejected. Reports include offline-generated and re-synced PoP logs using the original playback timestamps.

**The device clock must be correct — this is a hard requirement.** Reports group playback by the calendar day of `startTime` in the operator's timezone. A device whose clock runs ahead writes logs stamped in the future, and those rows cannot appear under **Today** or **Last 7 Days** (a range can never end later than the end of today). Therefore:

- Send `startTime` as a **UTC instant** in ISO 8601 with a real offset — `2026-04-22T10:30:00.000Z` or `2026-04-22T16:00:00+05:30`.
- **Never format local wall-clock time and append a literal `Z`.** `SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")` without `timeZone = TimeZone.getTimeZone("UTC")` is the classic form of this bug and shifts every log by the device's UTC offset.
  Prefer `Instant.now().toString()` (or `java.time` with `ZoneOffset.UTC`).
- Enable **automatic date & time** (NTP) on the device. If `android.provider.Settings.Global.AUTO_TIME` is off, surface it during pairing.
- The response field `clockSkewed` counts entries in the batch whose `startTime` was more than 5 minutes ahead of server time. **A non-zero value means the device clock is wrong** — log it and show it in the player's diagnostics screen. The rows are still stored (playback is never dropped), but they will be reported under the wrong day until the clock is fixed.

**Response (200):**
```json
{
  "received": 3,
  "skipped": 0,
  "duplicates": 0,
  "clockSkewed": 0,
  "accepted": true,
  "deviceId": "clx...",
  "deviceName": "Lobby Screen",
  "popLogsExpected": true
}
```
- `received`: rows newly stored
- `duplicates`: entries the server already had (safe to drop from the queue)
- `skipped`: entries not stored (`duplicates` + malformed entries)
- `clockSkewed`: entries stamped >5 min ahead of server time — fix the device clock

---

### 2.3 CMS-Side Pairing (For Reference — Already Built)

The CMS web dashboard at `/app/devices` has a **"Add Device"** button that opens a modal where the user enters the 6-digit pairing code and a display name. This calls:

```
POST /api/client-data/devices/pair
Authorization: Bearer <user-jwt>
x-organization-id: <org-id>

{ "pairingCode": "A3X9PZ", "name": "Lobby Screen" }
```

This assigns the device to the user's organization, generates the `deviceToken`, clears the pairing code, and sets `isPaired = true`.

---

## Part 3: Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PAIRING PHASE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ANDROID PLAYER                    ORION API                        │
│  ─────────────                     ─────────                        │
│  1. Generate UUID (hardwareId)                                      │
│  2. POST /player/init-pairing ──►  Creates draft device             │
│     { hardwareId }              ◄── Returns { pairingCode: "A3X9PZ"}│
│  3. Display code on screen                                          │
│  4. Poll every 5s:                                                  │
│     GET /pairing-status/{id} ──►   Checks isPaired flag             │
│                               ◄── { isPaired: false }               │
│                                                                     │
│  CMS USER                                                           │
│  ────────                                                           │
│  5. Clicks "Add Device" on CMS                                      │
│  6. Enters "A3X9PZ" + "Lobby Screen"                                │
│  7. POST /client-data/devices/pair ► Assigns org, generates token   │
│                                                                     │
│  ANDROID PLAYER (next poll)                                         │
│  8. GET /pairing-status/{id} ──►                                    │
│                               ◄── { isPaired: true,                 │
│                                      deviceToken: "d0d7e3...",      │
│                                      organizationId: "cmo9..." }    │
│  9. Store token in EncryptedSharedPreferences                       │
│  10. Transition to Playback Screen                                  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                       PLAYBACK PHASE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Every revisionPollIntervalSeconds (5s default):                    │
│  GET /player/sync-revision ─────►  revision + syncRequired          │
│  If revision changed OR syncRequired → GET /player/sync immediately │
│                                                                     │
│  Fallback every syncIntervalSeconds (120s default):                 │
│  GET /player/sync?playlistVersion=N&knownAssetIds=...               │
│                               ──►  Incremental manifest + deltas  │
│  Download only requiresDownload    (pre-signed S3 URLs, 7d expiry)  │
│  Delete removedAssetIds locally    after successful sync            │
│  Play in loop (position order)                                      │
│                                                                     │
│  Immediately after pairing + on FORCE_SYNC command:                 │
│  GET /player/sync (do not wait for periodic timer)                  │
│                                                                     │
│  Every 60 seconds:                                                  │
│  POST /player/heartbeat ────────►  syncRequired + optional command  │
│  { cpu, ram, temp, currentContent }  Execute command immediately    │
│                                                                     │
│  Every 5 minutes:                                                   │
│  POST /player/pop-logs ─────────►  Submits playback analytics       │
│  { logs: [...] }                   (flush Room DB queue)            │
│                                                                     │
│  OFFLINE MODE:                                                      │
│  If network unavailable → keep looping cached content               │
│  Queue heartbeats + PoP logs in Room DB                             │
│  Flush queues when connection restored                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Kotlin Retrofit Interface (Starter)

```kotlin
interface OrionPlayerApi {

    // ── Pairing (no auth) ──────────────────────────────────

    @POST("player/init-pairing")
    suspend fun initPairing(
        @Body body: InitPairingRequest
    ): InitPairingResponse

    @GET("player/pairing-status/{hardwareId}")
    suspend fun getPairingStatus(
        @Path("hardwareId") hardwareId: String
    ): PairingStatusResponse

    // ── Authenticated (device token) ───────────────────────

    @POST("player/heartbeat")
    suspend fun sendHeartbeat(
        @Header("Authorization") token: String,
        @Body body: HeartbeatRequest
    ): HeartbeatResponse

    @GET("player/sync-revision")
    suspend fun getSyncRevision(
        @Header("Authorization") token: String
    ): SyncRevisionResponse

    @GET("player/sync")
    suspend fun syncPlaylist(
        @Header("Authorization") token: String,
    @Query("playlistVersion") playlistVersion: Int? = null,
    @Query("layoutVersion") layoutVersion: Int? = null,
    @Query("knownAssetIds") knownAssetIds: String? = null,
        @Query("assetVersions") assetVersions: String? = null,
    @Query("recoverCache") recoverCache: Boolean? = null,
    @Query("missingAssetIds") missingAssetIds: String? = null,
    ): SyncResponse

    @POST("player/pop-logs")
    suspend fun submitPopLogs(
        @Header("Authorization") token: String,
        @Body body: PopLogsRequest
    ): PopLogsResponse

    @POST("player/cache-report")
    suspend fun reportCache(
        @Header("Authorization") token: String,
        @Body body: CacheReportRequest
    ): CacheReportResponse
}

// ── Data Classes ───────────────────────────────────────────

data class InitPairingRequest(val hardwareId: String)
data class InitPairingResponse(
    val hardwareId: String,
    val isPaired: Boolean,
    val pairingCode: String?
)

data class PairingStatusResponse(
    val isPaired: Boolean,
    val deviceToken: String?,
    val organizationId: String?,
    val deviceName: String?
)

data class HeartbeatRequest(
    val cpu: Int,
    val ram: Int,
    val temp: Int,
    val currentContent: String? = null
)
data class HeartbeatResponse(
    val status: String,
    val contentRevision: String? = null,
    val syncRequired: Boolean = false,
    val syncIntervalSeconds: Int = 120,
    val revisionPollIntervalSeconds: Int = 5,
    val initialSyncPending: Boolean = false,
    val initialSyncTimeoutSeconds: Int = 120,
    val configVersion: Int? = null,
    val features: Map<String, Boolean>? = null,
    /** CMS-managed display settings. Apply immediately without restarting playback. */
    val display: PlayerDisplaySettings? = null,
    val command: String? = null,
    val commandId: String? = null,
)

data class PlayerDisplaySettings(
    /** LANDSCAPE | PORTRAIT — rotate the playback surface to match. */
    val orientation: String = "LANDSCAPE",
    /**
     * When true, scale every playlist asset (image/video/document/url) to fill
     * the entire display (may crop / ignore aspect ratio). When false, preserve
     * aspect ratio (letterbox / pillarbox as needed).
     */
    val stretchToFit: Boolean = false,
    /**
     * Device-level default durations (seconds), applied only when a manifest
     * entry has durationSeconds == null. Apply immediately when configVersion
     * changes — no app restart.
     */
    val playback: PlayerPlaybackDurations? = null,
)

data class PlayerPlaybackDurations(
    val imageDuration: Int = 10,
    val videoDuration: Int = 10,
    val documentDuration: Int = 20,
    val urlDuration: Int = 20,
)

data class SyncRevisionResponse(
    val revision: String,
    val updatedAt: String?,
    val syncRequired: Boolean,
    val playlistVersion: Int?,
    val layoutVersion: Int?,
    val contentType: String,
    val playlistId: String?,
    val layoutId: String?,
    /** Why playlistId is what it is: schedule | manual-playlist | manual-layout | none. */
    val contentSource: String? = null,
    /** Informational only — the server has already applied the schedule to playlistId. */
    val activeSchedule: ActiveSchedule? = null,
    val initialSyncPending: Boolean,
    val revisionPollIntervalSeconds: Int = 5,
    val syncIntervalSeconds: Int = 120,
)

data class ActiveSchedule(
    val scheduleId: String,
    val scheduleName: String,
    val playlistId: String,
    val startDateTime: String,
    val endDateTime: String,
)

data class SyncResponse(
    val unchanged: Boolean,
    val playlistVersion: Int?,
    val playlist: PlaylistInfo?,
    val layoutVersion: Int? = null,
    val layout: LayoutInfo? = null,
    val assets: List<AssetInfo>,
    val tickers: List<TickerInfo> = emptyList(),
    val currentAssetIds: List<String>,
    val removedAssetIds: List<String>,
    val syncRequired: Boolean = false,
    val pendingDownloadCount: Int = 0,
    val contentRevision: String? = null,
    val cacheCommand: CacheCommandInfo? = null,
    val revisionPollIntervalSeconds: Int = 5,
    val syncIntervalSeconds: Int = 120,
    val initialSyncPending: Boolean = false,
    val configVersion: Int? = null,
    val features: Map<String, Boolean>? = null,
    val display: PlayerDisplaySettings? = null,
)

data class CacheCommandInfo(
    val id: String,
    val command: String, // FORCE_SYNC | CLEAR_CACHE | REDOWNLOAD_PLAYLIST
)
data class PlaylistInfo(val id: String, val name: String)

data class LayoutInfo(
    val id: String,
    val name: String,
    val resolution: String,   // LANDSCAPE_1080P | LANDSCAPE_4K | PORTRAIT
    val zones: List<LayoutZoneInfo>,
)

data class LayoutZoneInfo(
    val id: String,
    val name: String,
    val type: String,          // PLAYLIST | TICKER | IMAGE | HTML | CLOCK
    val x: Double,
    val y: Double,
    val w: Double,
    val h: Double,
    val zIndex: Int,
    val playlistId: String? = null,
    val playlistVersion: Int? = null,
    val playlistName: String? = null,
    val assets: List<AssetInfo>? = null,
    val assetId: String? = null,
    val asset: AssetInfo? = null,
    val ticker: TickerInfo? = null,
)

data class TickerInfo(
    val id: String,
    val text: String,
    val position: String,        // "TOP" | "BOTTOM"
    val speed: String,           // "SLOW" | "NORMAL" | "FAST"
    val heightPercent: Int,      // 10–20: % of screen height the bar occupies
    val style: String,           // "CLASSIC" | "NEON" | "GRADIENT" | "MINIMAL"
    val textColor: String,       // hex, e.g. "#00e5ff"
    val backgroundColor: String, // hex, e.g. "#1a1f2e"
    val priority: String,        // "LOW" | "NORMAL" | "URGENT"
)
data class AssetInfo(
    val id: String,
    val name: String,
    val type: String,        // IMAGE, VIDEO, DOCUMENT, URL
    val mimeType: String,
    val documentFormat: String?, // pdf | doc | docx | ppt | pptx (legacy: word | powerpoint); null for non-documents
    val durationSeconds: Int?, // null = no playlist override; use the device default for this type
    val position: Int,
    val assetVersion: Int,
    val updatedAt: String,   // ISO 8601
    val contentHash: String?,
    val status: String,      // READY, UPLOADING, ERROR, ...
    val available: Boolean,  // false when asset cannot be played yet
    val unavailableReason: String?, // human-readable reason when available=false
    val requiresDownload: Boolean,
    val downloadUrl: String?,
    val url: String?,        // populated for type URL; use WebView, no S3 download
    val fileSize: Int
)

data class PopLogEntry(
    val assetName: String? = null,
    val content: String? = null,
    val playlistName: String? = null,
    val campaignName: String? = null, // deprecated — campaigns removed; leave null
    val status: String,              // "VERIFIED" or "FAILED"
    val startTime: String? = null,   // ISO 8601
    val endTime: String? = null,
    val durationSeconds: Int? = null,
    val timestamp: String? = null,   // legacy alias for startTime
)
data class PopLogsRequest(val logs: List<PopLogEntry>)
data class PopLogsResponse(
    val received: Int,
    val duplicates: Int = 0,
    val clockSkewed: Int = 0, // >0 means the device clock is ahead of the server
)

data class CacheReportAsset(
    val assetId: String,
    val assetName: String,
    val assetType: String,
    val mimeType: String? = null,
    val playlistId: String? = null,
    val playlistName: String? = null,
    val fileSize: Int? = null,
    val assetVersion: Int? = null,
    val contentHash: String? = null,
    val downloadStatus: String,
    val localCacheStatus: String,
    val downloadedAt: String? = null,
)

data class CacheReportRequest(
    val currentPlaylistId: String? = null,
    val currentPlaylistName: String? = null,
    val playlistVersion: Int? = null,
    val currentLayoutId: String? = null,
    val currentLayoutName: String? = null,
    val layoutVersion: Int? = null,
    val cacheTotalBytes: Int? = null,
    val cacheUsedBytes: Int? = null,
    val storageTotalBytes: Int? = null,
    val cachedAssetCount: Int? = null,
    val expectedAssetCount: Int? = null,
    val pendingDownloadCount: Int? = null,
    val syncStatus: String? = null,
    val lastSuccessfulSyncAt: String? = null,
    val lastFailedSyncAt: String? = null,
    val lastSyncError: String? = null,
    val completedCommandId: String? = null,
    val commandFailed: Boolean? = null,
    val commandError: String? = null,
    val assets: List<CacheReportAsset>,
)

data class CacheReportResponse(val received: Boolean)
```

> **Note:** Pass `"Bearer $deviceToken"` to the `token` parameter (include the `Bearer ` prefix).

---

## Part 5: Error Handling

All endpoints return standard HTTP error responses:

| Status | Meaning | Example |
|--------|---------|---------|
| `400` | Bad request / validation error | `{ "message": "hardwareId is required" }` |
| `401` | Invalid or missing device token | `{ "message": "Invalid or unpaired device token" }` |
| `404` | Device not found | `{ "message": "Unknown device. Call init-pairing first." }` |

The Android app should handle:
- **401 errors** on any authenticated endpoint (`heartbeat`, `sync`, `sync-revision`, `pop-logs`, `cache-report`, `device-report`, `system-logs`) → **immediately**:
  1. Stop current playback
  2. Clear stored `deviceToken` / pairing session from EncryptedSharedPreferences
  3. Navigate to the **Pair Device** screen
  4. Call `POST /api/player/init-pairing` to obtain a **new** pairing code
- Detection SLA: with the existing `revisionPollIntervalSeconds` (5s) poll of `GET /api/player/sync-revision`, an unregistered or deleted device must return to pairing **within 30 seconds** (typically within one poll cycle). Do not wait for the longer heartbeat interval alone.
- **CMS Unregister:** the server clears `deviceToken`, `isPaired`, playlist/layout assignment and org membership. The next authenticated call returns **401**. Re-pair with the new code via CMS "Add Device".
- **CMS Delete:** the device row is removed. Authenticated calls return **401**. `init-pairing` creates a **brand-new** draft device for the same `hardwareId`. Treat it as a first-time pair.
- **Network errors** → switch to offline mode, queue logs, retry with exponential backoff
- **404 on pairing-status** → re-call `init-pairing` to register the device again

> Do **not** continue playback after a 401. The CMS has revoked this player's session.
