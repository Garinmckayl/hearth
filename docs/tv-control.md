# Movie night with Pip

Hearth's new direction is a playful entertainment companion: **Your TV Has Someone In It.** Movie night combines viewer taste, explicit watch-session memories, recommendations, and permissioned TV actions. Character activities, dance, and expressions remain part of her personality.

The primary movie shelf and its real-player/browser evidence are described in [movie-night.md](movie-night.md). The setup below concerns external TV apps.

## Native Vega route — no physical television required for development

Amazon explicitly supports media-hub clients through Vega Media Controls. Hearth now includes `@amazon-devices/kepler-media-controls` 1.0.25, endpoint discovery, explicit package selection, play/pause/stop commands, advertised-capability checks, and provider-state sampling. Clients are released after operations. A native WebView message bridge restricts requests to the configured HTTPS home origin. No ADB owner key is needed for this route: enable controls for the page session, then confirm each operation.

Approved cross-app URLs are supplied at build time using `HEARTH_VEGA_TARGETS_JSON`, an array of `{id,title,url}` objects. Use `prime` as the ID for an app home link or a checked 10-character content ID for a title. Title targets default to an empty array. Prime home/search use fixed HTTPS Prime Video URLs, with installed-handler checks; no app installation or entitlement is assumed. `Linking.canOpenURL` must succeed before `Linking.openURL` runs. Global Back/return navigation is not supplied by this adapter.

Vega viewing preferences, explicit reviews, and user-requested playback snapshots persist in `localStorage` under `hearth.viewer.v1`. Snapshots record provider-reported state and position, not DRM pixels, exact stop points, or complete watch history. Clearing the viewing profile also ends the current voice/pairing context. Local storage is not encrypted or synced.

The native integration passes unit/component tests and TypeScript checks; these are not runtime proof. The official simulator may return no endpoints, and a specific provider can omit position data or reject a control. Prime Video availability in the simulator is **not established**. The existing successful simulator screenshots predate this integration. The authorized replacement M1 host is pending; see `cloud-simulator.md`.

Official references reviewed:

- https://developer.amazon.com/docs/vega/0.24/media-controls-guide — explicitly documents client methods for cross-app media hubs.
- https://developer.amazon.com/docs/vega/0.24/media-controls-get-started — endpoint discovery, command dispatch, state queries, and native client cleanup.
- https://developer.amazon.com/docs/vega/0.24/deep-links-vega-apps — app-to-app Linking requires supported messaging contracts.
- https://developer.amazon.com/docs/vega/0.24/content-launcher-overview — an app's integration with Fire TV discovery, not unrestricted access to Prime's catalog or account.

Remaining native gate: run the new package on the official ARM simulator; enumerate actual providers and handlers; exercise a real media endpoint; capture command acknowledgments alongside observed player changes. A provider sample can establish generic cross-app media control but must never be presented as Prime Video.

## Implemented versus verified

Implemented: locked-by-default movie-night UI, backend-persisted household preferences/reviews, owner-configured title catalog, voice-requested confirmation cards, and a restricted ADB command adapter. Automated tests use a fake ADB process; browser tests use a fake TV endpoint. **There is no attached Fire TV, so no physical Prime Video launch, title resolution, media key response, or return-to-Hearth has been verified.**

The ADB adapter described below targets **Fire OS / Android**, not Vega. Use the separate native Vega route above for simulator work. Do not show simulated requests as working cross-app footage. The current bounded native simulator session is documented in `cloud-simulator.md`.

## Controlled developer setup

1. Use a Fire OS device you own or are authorized to control. Enable developer ADB debugging and approve the host through the device's authorization prompt. Keep ADB private; never expose port 5555 to the public internet. Connect using the device's documented debugging workflow and verify it appears as authorized in `adb devices`.
2. Run Hearth's backend on a host with `adb` and private network access to that device. `HEARTH_TV_ADB_SERIAL` must exactly match its serial from `adb devices`; no automatic device selection is used. Determine the installed Prime Video package on that exact device and set `HEARTH_TV_PRIME_PACKAGE`; no package name is assumed. Missing package configuration rejects Prime/title actions.
3. Generate an owner key, for example `openssl rand -hex 32`, and place it in server-only `.env`. Set `HEARTH_TV_ENABLED=true`, `HEARTH_TV_TOKEN`, `HEARTH_TV_ADB_SERIAL`, and a future absolute UTC `HEARTH_TV_EXPIRES_AT`. Missing or expired configuration disables access. This expiry disables commands; it does not provision or terminate infrastructure.
4. Optionally configure `HEARTH_TV_CATALOG_FILE` to a private JSON file. Every entry needs an actual verified 10-character uppercase alphanumeric ASIN in `id`, a `title`, and optional `genres` (string) and `minutes` (integer). Use only titles checked for the account and region. No invented title IDs or availability data is bundled.
5. Restart the backend. In Hearth choose **Something together → Movie night with Pip**, enter the owner key, and check TV connection. The key stays only in page memory, is not included in AI context, and is cleared by refresh or locking. Use HTTPS unless testing on localhost. Do not paste the key into voice chat or screenshots.
6. Save preferences explicitly, then start a fresh voice conversation or phone pairing. With remembering enabled, approved viewer preferences, recent explicit history, and the catalog join the conversation context. Ask for a short recommendation or ask Pip to open Prime Video. Confirm the displayed card before any command is sent.

The example shape below is illustrative, not a valid title catalog; replace the placeholder with an actual checked ASIN:

```json
[
  {"id": "REPLACE_WITH_VERIFIED_ASIN", "title": "A title you have checked", "genres": "Comedy, warm", "minutes": 24}
]
```

## Action semantics

- Open Prime Video: send an Android launcher request for the owner-configured `HEARTH_TV_PRIME_PACKAGE`. Package identity and installation must be checked on the target device.
- Open a catalog title: send `ACTION_VIEW` for `https://www.amazon.com/gp/video/detail/ASIN`, constrained to the Prime package. This is an experimental handoff; a handler may be unavailable, and acceptance is not proof that the right title played. Device/account/region compatibility must be verified.
- Pause/resume/stop: send distinct Android media pause/play/stop keys, not a toggle. Stop is not a force-stop or process kill. Foreground apps can ignore them. No playback-state telemetry exists.
- Back: send the Back key. Its effect depends on the foreground screen.
- Return to Hearth: start the installed Android activity `com.hearth.tv/.MainActivity`. This is not a force-stop, and does not establish that another app stopped audio. There is deliberately no force-stop tool.

Only fixed commands are accepted; there is no generic shell, arbitrary URL, arbitrary package, purchase, subscription, or account-login action. API requests require an owner key and same origin. Each UI or voice-requested device action needs an on-screen confirmation. A model tool initially receives only “confirmation shown”; the actual command result is sent as a subsequent user-visible turn where a voice connection remains available.

## Memory and watch together

The single-household profile is stored at `HEARTH_TV_PROFILE_FILE` (default `data/viewer.json`), outside public assets and ignored by Git. It is not encrypted or cloud-synchronized and is not a multi-user identity system. File permissions are restricted on creation. Use disk encryption and appropriate access control on the host.

Preference saves and reviews are explicit. History distinguishes `launch-request` from `viewer-review`; it never infers completed viewing, episode count, or playback position. A person can report where they stopped. Deleting the viewing profile clears preferences/history and ends the current Hearth voice/pairing session so the old context is not reused. This profile is separate from existing home memories; the UI explains that distinction.

Hearth Cinema now plays credited open films with Pip beside the player, real playback telemetry, live discussion, spoken play/pause, and optional remembered progress. Co-watch audio runs on the paired phone and survives TV backgrounding. An explicitly delegated Fire OS bridge can route bounded external controls from that phone; Vega native control after backgrounding is not assumed. Prime DRM sensing, automatic episode detection, bedtime closing, and provider progress synchronization remain unimplemented. See `movie-night.md` for the exercised flow and exact limits.

## Hardware acceptance gate

- [ ] Authorized exact device identified; ADB remains private; expired key/config rejects operations.
- [ ] Prime launcher request reaches the right app; missing app returns failure.
- [ ] At least one checked catalog link resolves to the intended title for the actual account/region.
- [ ] Media pause/play visibly work; unexpected foreground screens are handled honestly.
- [ ] Hearth return activity is installed and visibly reopens; verify whether playback continues rather than assuming it stopped.
- [ ] Preferences survive backend restart, are present only in permitted conversation context, and can be deleted.
- [ ] Demonstrate what happens to voice on app switch and how the person reconnects.
- [ ] Only after these pass, record cross-app footage on a supported real device. Keep official Vega evidence for the parts actually exercised there.
