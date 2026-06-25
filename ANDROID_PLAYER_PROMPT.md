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
Our platform has a backend (NestJS) that manages `Organizations`, `Playlists`, `Layouts` (multi-zone screen designs), `Assets` (Images, Videos, HTML, URL), and `Tickers` (scrolling text overlays). The backend API is already fully implemented and documented in detail below. The Android player will consume these APIs.

> **Note (architecture):** There is **no "Campaign" layer**. Playlists link **directly** to assets (`Playlist → PlaylistAsset → Asset`). A device can play either a **full-screen playlist** OR a **multi-zone layout** assigned from the CMS Layout Designer. When a layout is assigned, `/sync` returns zone geometry + per-zone content instead of a single full-screen playlist.

**Core Requirements:**

1.  **Tech Stack:**
    *   Language: Kotlin
    *   UI: Jetpack Compose (preferred) or XML Layouts.
    *   Media Playback: **ExoPlayer** for videos (gapless loop), **Coil/Glide** for images, and **WebView** for HTML and URL assets.
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
    *   **Periodic Re-sync:** Re-fetch the playlist manifest every 5 minutes to detect content updates. Download only new/changed assets.
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
- The `GET /api/player/sync` manifest is structurally **unchanged** (still a flat, ordered list of assets with `position` + `durationSeconds`). No change needed to playback.
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
  "status": "ok"
}
```

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

**Example:** `GET /api/player/sync?playlistVersion=3&knownAssetIds=abc,def&assetVersions=abc:1,def:2`

Pre-signed S3 download URLs are valid for **7 days** (long enough for offline download windows between syncs).

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
  "assets": [],
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
      "durationSeconds": 10,
      "position": 0,
      "assetVersion": 2,
      "updatedAt": "2026-06-18T12:00:00.000Z",
      "contentHash": "d41d8cd98f00b204e9800998ecf8427e",
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
      "durationSeconds": 30,
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
      "durationSeconds": 15,
      "position": 2,
      "assetVersion": 1,
      "updatedAt": "2026-06-01T00:00:00.000Z",
      "contentHash": null,
      "requiresDownload": false,
      "downloadUrl": null,
      "url": "https://weather.com",
      "fileSize": 0
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
1. Persist `playlistVersion` and per-asset `assetVersion` + `contentHash` after a successful sync.
2. On each sync poll, send `playlistVersion`, `knownAssetIds`, and `assetVersions`.
3. If `unchanged: true`, keep playing from local cache — no downloads needed.
4. If `removedAssetIds` is non-empty, delete those local files **only after** a successful sync response.
5. Download only assets where `requiresDownload: true`.
6. Playback never requires live internet — only sync, heartbeat, and PoP upload use the network.

**Asset types:** `IMAGE`, `VIDEO`, `HTML`, `DOCUMENT`, `URL`

**Playback logic:**
1. Sort assets by `position` (already sorted in response)
2. Play each asset for `durationSeconds`
3. For `IMAGE`: display using Glide/Coil for the specified duration
4. For `VIDEO`: play using ExoPlayer (may exceed `durationSeconds` — play to completion)
5. For `HTML`: render in a WebView for the specified duration
6. For `URL`: load `url` in a WebView for `durationSeconds` (no download/cache — `downloadUrl` is null)
7. Loop back to position 0 when the last asset finishes

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

**Delayed / offline logs:** The server accepts logs with historical `startTime` values (e.g. generated days ago while offline). There is no maximum age — only timestamps more than 24 hours in the future are rejected. Reports include offline-generated and re-synced PoP logs using the original playback timestamps.

**Response (200):**
```json
{
  "received": 3
}
```

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
│  Every 5 minutes:                                                   │
│  GET /player/sync?playlistVersion=N&knownAssetIds=...               │
│                               ──►  Incremental manifest + deltas  │
│  Download only requiresDownload    (pre-signed S3 URLs, 7d expiry)  │
│  Delete removedAssetIds locally    after successful sync            │
│  Play in loop (position order)                                      │
│                                                                     │
│  Every 60 seconds:                                                  │
│  POST /player/heartbeat ────────►  Updates device telemetry in CMS  │
│  { cpu, ram, temp, currentContent }                                 │
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

    @GET("player/sync")
    suspend fun syncPlaylist(
        @Header("Authorization") token: String,
    @Query("playlistVersion") playlistVersion: Int? = null,
    @Query("layoutVersion") layoutVersion: Int? = null,
    @Query("knownAssetIds") knownAssetIds: String? = null,
        @Query("assetVersions") assetVersions: String? = null,
    ): SyncResponse

    @POST("player/pop-logs")
    suspend fun submitPopLogs(
        @Header("Authorization") token: String,
        @Body body: PopLogsRequest
    ): PopLogsResponse
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
data class HeartbeatResponse(val status: String)

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
    val type: String,        // IMAGE, VIDEO, HTML, DOCUMENT, URL
    val mimeType: String,
    val durationSeconds: Int,
    val position: Int,
    val assetVersion: Int,
    val updatedAt: String,   // ISO 8601
    val contentHash: String?,
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
data class PopLogsResponse(val received: Int)
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
- **401 errors** on authenticated endpoints → return to the Pairing screen (token may have been revoked)
- **Network errors** → switch to offline mode, queue logs, retry with exponential backoff
- **404 on pairing-status** → re-call `init-pairing` to register the device again
