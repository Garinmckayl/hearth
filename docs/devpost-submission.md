# Hearth: Movie Night with Pip — Your TV Has Someone In It

> **One-Line Naming Key for Judges:**  
> **Hearth** is the cozy Fire TV living room & cinema app (`com.hearth.tv.main`); **Pip** is the AI woodland companion who lives inside it.
>
> **Tagline / Elevator Pitch:**  
> What if your television had someone living inside it? **Hearth** turns your Fire TV into a warm shared home with **Pip**—a witty AI companion who remembers your movie taste, picks tonight’s film aloud with **Amazon Nova 2 Sonic**, controls playback when you speak into your phone, and keeps you company while you watch.

- **Primary Track:** Fire TV Track (Vega OS & Fire OS)
- **Mini Challenge:** AWS Builder Challenge (Amazon Bedrock Nova 2 Sonic, Amazon Bedrock Nova 2 Lite, Amazon Transcribe Streaming, AWS EC2 Mac + SSM)
- **GitHub Repository:** `https://github.com/Garinmckayl/hearth`
- **Live Interactive Showcase & Demo Videos:** `https://jean-expo-belkin-favorite.trycloudflare.com/`
- **Live TV Home Preview:** `https://donor-boot-restaurant-taught.trycloudflare.com/?tv=1`
- **Live Movie Night with Pip:** `https://donor-boot-restaurant-taught.trycloudflare.com/?movies=1`

---

## Inspiration

Modern televisions have access to tens of thousands of movies and shows, yet sitting down at night and figuring out *what to watch* still feels like lonely work. You scroll through endless rows of posters, bounce between apps, or leave the TV running in the background just so the room doesn’t feel empty.

We asked a simple question: **What if your television wasn’t just a catalog of tiles, but a warm home with someone in it?**

That question became **Hearth**, and its resident woodland companion, **Pip**. Pip lives inside an illustrated fireside living room on your TV—tending her fern, reading by the window, doing a slightly ridiculous fireside shuffle when you ask her to dance, and running **Movie Night**. Instead of acting like a sterile voice assistant or a customer-support chatbot, Pip has her own playful opinions, remembers what you enjoyed on previous nights, helps you choose a film, opens it in **Hearth Cinema** (or prepares a **Prime Video** search handoff), pauses or resumes playback when you ask, and stays with you on your phone while you watch.

During an early family playtest, the builder’s grandmother spent three hours talking and laughing with Pip, and the builder’s father called it the coolest thing he had seen on a TV. That moment convinced us that a 10-foot television interface can feel genuinely warm, personal, and alive—while remaining transparent, user-controlled, and honest about what it can and cannot do.

---

## What It Does

### 1. Movie Night with Pip (Voice-Guided Film Selection & Real Playback)
- **Opinionated, Catalog-Grounded Recommendations:** Tell Pip what you’re in the mood for—*“Something funny and short, with woodland animals”*—and Pip narrows the shelf to matching titles, explains *why* she picked them, and **speaks her recommendation aloud in real 24 kHz Amazon Nova 2 Sonic audio**.
- **Built-In Hearth Cinema Player (`HTTP 206` Byte-Range Streaming):** Open films (*Big Buck Bunny*, *Caminandes: Llamigos*, and the *Sintel* trailer) stream directly inside Hearth’s 10-foot TV player with live playback telemetry (`PLAYING`, `PAUSED`, `ENDED`, current timestamp), captions, and optional intermission remarks from Pip.
- **Explicit Prime Video Handoff:** For commercial catalog suggestions (*Paddington*, *Wallace & Gromit*, *The Secret of Kells*), Hearth presents an explicit **Over to Prime Video** confirmation card and launches a deep-linked Prime Video search (`Linking.openURL` / native Fire TV bridge) without ever fabricating subscription availability or watch history.
- **User-Controlled Taste Memory:** Viewers can opt in to save their movie preferences and resume positions across visits—or clear every saved movie memory with a single click.

### 2. Zero-Friction Phone Companion & Co-Watch Mode
- **QR Phone Pairing:** Not every TV remote exposes raw microphone PCM to apps, and when you switch to another TV app, a normal TV app loses focus. Scanning Hearth’s on-screen QR code pairs your phone in seconds over an authenticated WebSocket room (`/api/room-stream`).
- **Spoken Playback Controls with Measured TV Acknowledgment:** While a film is playing on the TV, speak into your paired phone—*“Pip, pause the movie”*—and **Amazon Nova 2 Sonic** invokes the `perform_world_action` tool (`tv-pause`). Crucially, Pip **waits for the television player to confirm `PAUSED` with its exact timestamp** before she speaks back to confirm the pause.
- **Co-Watch Survival Across TV Backgrounding:** When the TV app goes into the background (`hearthPause()` / native `AppState` background transition), Pip’s live **Amazon Nova 2 Sonic** voice session stays alive on your paired phone so you can keep chatting about the film without dropping the connection.

### 3. A Living 10-Foot TV Home & Autonomous Character Rig
- **Full D-Pad & Remote Ergonomics:** Designed for a 10-foot viewing distance at `1920×1080` with spatial directional focus, native Vega OS remote handling (`kpenter`, `select`, `back`, directional arrows), readable typography, and high-contrast focus rings.
- **Synchronized World Actions & Vibes:** Ask Pip to dance, wave, laugh, stretch, water her fern, read, stargaze, or switch the home between **Warm & Cozy** (amber firelight) and **Crisp & Cold** (snowfall outside an open window and Pip wrapped in her scarf).
- **Optional Hands-Free Ambient Mode:** Alongside direct **Nova 2 Sonic** conversation, an optional hands-free mode streams room audio through **Amazon Transcribe Streaming** and an attention classifier (**Jev**) so Pip only responds when words are actually directed to her—with no repeated wake word.

---

## How We Built It

```text
+-----------------------------------------------------------------------------------+
|                        FIRE TV / VEGA OS 10-FOOT DISPLAY                          |
|  +-----------------------------------------------------------------------------+  |
|  | React Native for Vega Wrapper (vega/App.tsx · RN 0.83 · Vega SDK 0.24.12112)|  |
|  | - @amazon-devices/webview (4.0.2) + injected HearthNative JS bridge         |  |
|  | - @amazon-devices/kepler-media-controls (1.0.25) & kepler-media-types       |  |
|  | - Native TV remote handler (kpenter / select / Back / D-pad spatial focus)  |  |
|  | - Hearth 1080p SVG/CSS Home + Built-In Hearth Cinema Video Player           |  |
|  +--------------------------------------+--------------------------------------+  |
+-----------------------------------------|-----------------------------------------+
                                          | HTTPS / WSS (Same-Origin + Token Auth)
                                          v
+-----------------------------------------------------------------------------------+
|                         HEARTH NODE.JS REALTIME SERVER                            |
|  - /api/voice (WSS)       -> Bidirectional PCM bridge & tool-ack state machine    |
|  - /api/movie-night (POST)-> Catalog-grounded film picker + Nova 2 Sonic voice    |
|  - /api/speak (POST)      -> 24 kHz Amazon Nova 2 Sonic WAV synthesis & cache     |
|  - /api/room-stream (WSS) -> Private QR phone pairing & co-watch telemetry relay  |
|  - /api/tv (POST)         -> Owner-authorized Fire OS / ADB TV control adapter    |
+-------------------+-----------------------------------+---------------------------+
                    |                                   |
                    | HTTP/2 Bidirectional Stream       | WSS Co-Watch & Mic Stream
                    v                                   v
+---------------------------------------+   +---------------------------------------+
|            AWS AI SERVICES            |   |       PAIRED PHONE COMPANION          |
| - Amazon Bedrock Nova 2 Sonic         |   | - WebRTC / AudioWorklet 16 kHz PCM    |
|   (amazon.nova-2-sonic-v1:0)          |   | - Co-watch playback remote (Pause,    |
|   16 kHz PCM in / 24 kHz PCM out +    |   |   Resume, Return to Hearth, Discover) |
|   perform_world_action tool use       |   | - Keeps Nova 2 Sonic voice alive when |
| - Amazon Bedrock Nova 2 Lite          |   |   TV app backgrounds                  |
|   (us.amazon.nova-2-lite-v1:0)        |   +---------------------------------------+
| - Amazon Transcribe Streaming         |
+---------------------------------------+
```

1. **Native Vega OS Application (`vega/`):**
   - Built with **React Native for Vega (`0.83.0`)** and **Amazon Vega SDK `0.24.12112`** (`hearth-vega-aarch64.vpkg`, package ID `com.hearth.tv.main`).
   - Uses `@amazon-devices/webview` (`4.0.2`) to host the 1080p Hearth scene while injecting the `window.HearthNative` bridge for hardware Back navigation, lifecycle pause/resume (`AppState`), app-to-app deep linking (`Linking.canOpenURL` / `Linking.openURL`), and native media endpoint discovery via `@amazon-devices/kepler-media-controls` (`1.0.25`) and `@amazon-devices/kepler-media-types` (`1.0.0`).
2. **Amazon Bedrock Nova 2 Sonic (`lib/sonic.mjs`, `lib/speech.mjs`, `lib/movie-night.mjs`, `lib/voice-server.mjs`):**
   - Uses `@aws-sdk/client-bedrock-runtime` (`InvokeModelWithBidirectionalStreamCommand`) over HTTP/2 (`NodeHttp2Handler`) to stream `16 kHz` 16-bit mono PCM microphone input into `amazon.nova-2-sonic-v1:0` and play back `24 kHz` 16-bit mono PCM audio in real time.
   - Powers both live bidirectional conversation (`/api/voice`) and Pip’s spoken Movie Night recommendations (`/api/movie-night` + `/api/speak`), caching the `24 kHz` Nova 2 Sonic audio stream so Pip speaks her movie pick immediately with zero robotic TTS fallback.
   - Implements a strict **acknowledged tool-execution loop** (`perform_world_action`): when Nova 2 Sonic calls `tv-pause`, `tv-play`, `dance`, `cold`, or `movie-night`, the server waits for the television client to execute the action and return a measured `action-result` before sending `toolResult` back into the Nova 2 Sonic stream.
3. **Authored SVG/CSS Character Rig & Cinema Engine (`public/`):**
   - Hand-authored 1920×1080 SVG character and room (`public/room.svg`, `public/actions.js`, `public/cinema.js`) with real-time Web Audio API RMS energy mouth-sync (`public/voice.js`), anticipation/settle animation beats, and an HTTP byte-range (`206 Partial Content`) cinema player.
4. **End-to-End Verification (`tests/` & `scripts/`):**
   - **101 automated tests** passing across three suites: **47 Node.js backend/security/protocol unit tests**, **16 Vega native wrapper Jest tests**, and **38 Playwright 1080p browser & cinema integration tests**, plus automated live capture scripts (`scripts/capture-cinema-smoke.mjs`) and official ARM64 Vega Virtual Device framebuffer verification (`artifacts/hearth-official-vega-arm-*.png`).

---

## Challenges We Ran Into

1. **Vega Simulator Architecture Compatibility (`x86_64` vs `aarch64` for WebView 4):**
   - When we first packaged Hearth for the Linux `x86_64` Vega Virtual Device, `kepler device install-app` failed with `Module dependency not found` for `/com.amazon.kepler.webview_4@IWebview_4` because the published WebView 4 simulator bundle targets `sim_tv_aarch64`. We solved this by building the native `aarch64` package (`hearth-vega-aarch64.vpkg`) and provisioning disposable Apple Silicon (`mac-m4.metal` / `mac2.metal`) hosts on AWS EC2 over SSM Session Manager to run the official ARM64 Vega Virtual Device headlessly.
2. **Simulator Remote `OK` Key Event Normalization (`kpenter` vs `select`):**
   - While directional D-pad navigation worked immediately on the ARM64 Vega simulator, pressing `OK` via the simulator’s QMP input socket delivered `eventType: "kpenter"` rather than `select`. We updated `vega/App.tsx` to normalize `kpenter`, `enter`, and `select` (filtering key-up release events) so remote activation works reliably across both simulator QMP injection and physical remotes.
3. **Preventing Hallucinated Playback Controls in Voice AI:**
   - Voice models love to say *"I’ve paused the movie for you!"* the instant they emit a tool call—even if the TV player failed or needed viewer confirmation. We engineered a two-phase acknowledgment boundary: Nova 2 Sonic’s `perform_world_action` tool blocks on a 5-second Promise until the TV WebView measures `video.paused === true` and returns `{ ok: true, summary: "Big Buck Bunny: PAUSED at 0:11." }`.
4. **Keeping Voice Alive When the TV Changes Apps (Co-Watch):**
   - Opening an external streaming app on a TV backgrounds the companion app. By routing co-watch audio and microphone capture through the paired phone room (`/api/room-stream`) and handling `window.hearthPause()` / `AppState` background transitions gracefully, the viewer’s live **Amazon Nova 2 Sonic** session continues uninterrupted on their phone even while the TV app is suspended.

---

## Accomplishments That We're Proud Of

- **100% Real Amazon Nova 2 Sonic Voice Across Every Interaction:** No robotic browser `speechSynthesis` fallback. From choosing a film on the Movie Night shelf to pausing playback from a paired phone and dancing by the fireplace, Pip speaks in natural 24 kHz **Amazon Nova 2 Sonic** audio.
- **A True 10-Foot Living Room Experience, Not a Chatbox on a TV:** Pip has idle autonomy, expressive eyes/mouth driven by live audio energy, seasonal room states (Warm & Cozy vs. Crisp & Cold), and a built-in cinema screen.
- **Verified on Both Official ARM64 Vega Simulator & Real-Time Nova 2 Sonic Streaming:** We built and verified the `hearth-vega-aarch64.vpkg` package on the official ARM64 Vega Virtual Device and backed the entire codebase with 101 automated tests.

---

## What We Learned

- **Voice AI on television needs a companion device strategy:** Pairing a phone via QR code solves three TV problems at once—universal microphone access, private near-field voice capture during a loud movie, and session continuity when the TV switches apps.
- **Strict honesty boundaries make AI companions more trustworthy:** Explicitly distinguishing between open films that play directly inside Hearth Cinema (with measured playback telemetry) and external Prime Video searches (which require viewer confirmation) makes the product dependable rather than gimmicky.
- **Headless cloud verification of Vega OS is practical with SSM + QMP:** Forwarding the Vega simulator’s control and framebuffer ports over AWS SSM Session Manager with zero inbound security group rules allows reproducible CI-style verification of TV apps.

---

## What's Next for Hearth

- **Physical Fire TV Stick / Omni Hardware Validation:** Complete end-to-end runtime validation of `@amazon-devices/kepler-media-controls` against commercial media providers on retail Vega OS / Fire OS hardware.
- **Multi-Viewer Household Profiles:** Let multiple family members or roommates combine their movie tastes during a shared Movie Night (*"Find something both Grandma and I will laugh at under 90 minutes"*).
- **Synchronized Remote Watch Parties:** Allow two televisions in different homes to pair into the same Hearth room so long-distance family members can choose a film with Pip and watch together.

---

## Built With

- `amazon-vega-os`
- `amazon-fire-tv`
- `react-native-kepler`
- `amazon-bedrock`
- `amazon-nova-2-sonic`
- `amazon-nova-2-lite`
- `amazon-transcribe`
- `aws-ec2-mac`
- `nodejs`
- `websockets`
- `javascript`
- `svg`
- `html5`
- `playwright`

---

## Demo Video Walkthrough (75 Seconds · 1080p)

- **Direct Video Link:** `https://jean-expo-belkin-favorite.trycloudflare.com/hearth-demo-showcase.mp4?v=sonic2`
- **`0:00 – 0:14` | Movie Night with Pip (Live Nova 2 Sonic Recommendation):** Viewer opens **Movie Night with Pip**, asks for *"Something funny and short, with woodland animals"*, and clicks **Pip, choose with me**. Pip narrows the shelf to *Big Buck Bunny*, *Paddington*, and *Sintel* and speaks her recommendation aloud in real **Amazon Nova 2 Sonic** (`24 kHz`) audio.
- **`0:14 – 0:38` | Built-In Film Playback & Spoken Phone Pause (`tv-pause`):** Viewer starts *Big Buck Bunny* in Hearth Cinema (`HTTP 206` streaming), pairs their phone via QR code, and speaks into the phone to pause. Live **Amazon Nova 2 Sonic** invokes `tv-pause`, waits for the TV player’s measured `PAUSED` acknowledgment, and replies aloud.
- **`0:38 – 0:50` | Phone Resume & Co-Watch Background Survival:** Viewer resumes playback from the paired phone (`PLAYING`), suspends the TV app (`background` state), and continues talking with Pip on the SAME phone voice session—receiving fresh **Amazon Nova 2 Sonic** audio while the TV is backgrounded.
- **`0:50 – 1:15` | Live Nova 2 Sonic Conversation & Fireside Dance:** Viewer speaks with Pip in her living room; Pip responds with synchronized mouth animation and performs her fireside shuffle dance (`perform_world_action: "dance"`).

---

## Bonus (+10%): Product Feedback & Reproducible Friction Log

### 1. Amazon Vega SDK (`0.24.12112`), CLI (`1.4.4`), and `@amazon-devices/webview` (`4.0.2`)
- **How we used it:** Packaged Hearth’s React Native for Vega shell (`com.hearth.tv.main`) into `hearth-vega-aarch64.vpkg` and ran it on Amazon’s official ARM64 Vega Virtual Device at 1920×1080.
- **What worked well:** WebView 4 renders complex 1080p SVG animations, CSS transitions, and injected JavaScript bridges cleanly. Authenticated console framebuffer capture (`screenshot.jpg`) made headless verification straightforward.
- **Friction #1 — Simulator Architecture Mismatch (`x86_64` vs `aarch64`) for WebView 4:**
  - *Task:* Install a validated Vega package using `@amazon-devices/webview` 4 on the official Linux `x86_64` Vega Virtual Device.
  - *Steps:* Boot SDK `0.24.12112` virtual device on Linux `x86_64` with KVM enabled, validate `.vpkg`, and run `kepler device install-app`.
  - *Expected:* Either the Linux `x86_64` simulator includes the WebView 4 runtime module, or `kepler project doctor` / package validation warns before building that WebView 4 requires `sim_tv_aarch64`.
  - *Actual:* Installation fails at runtime with `Module dependency not found` for `/com.amazon.kepler.webview_4@IWebview_4`.
  - *Workaround:* Build for `aarch64` (`hearth-vega-aarch64.vpkg`) and run on the official ARM64 Vega Virtual Device on Apple Silicon.
  - *Suggestion:* Publish a simulator module compatibility matrix and surface target-architecture module gaps during `kepler build` or `kepler project doctor`.
- **Friction #2 — Simulator Remote `OK` Key Event Name (`kpenter` vs `select`):**
  - *Task:* Activate focused UI controls on the official Vega simulator via remote input.
  - *Steps:* Send the remote `OK` key (`kp_enter`) through the simulator’s QMP input socket and inspect `useTVEventHandler` events in React Native.
  - *Expected:* Standard `select` handler activates the focused element.
  - *Actual:* The simulator delivers `eventType: "kpenter"`, so code listening only for `select` misses `OK` presses even though directional D-pad focus works.
  - *Workaround:* Normalize `kpenter`, `enter`, and `select` to the Enter action in `vega/App.tsx` and filter key-release events (`eventKeyAction === 0`).
  - *Suggestion:* Normalize `kpenter` to `select` in `@amazon-devices/react-native-kepler` or document `kpenter` prominently in the remote input guide.
- **Friction #3 — Virtual Device Startup Exit Code on Timeout:**
  - *Task:* Automate simulator startup and app installation in CI scripts.
  - *Steps:* Run `kepler virtual-device start` when boot hits a readiness timeout and inspect the process exit code.
  - *Expected:* Non-zero exit code when readiness fails.
  - *Actual:* Process can emit failure text while exiting with status `0`.
  - *Workaround:* Parse stdout/stderr for failure markers in `scripts/vega-simulator.mjs` and verify readiness with an explicit post-boot install/launch check (covered by unit tests in `tests/vega-simulator.test.mjs`).

### 2. Vega Media Controls (`@amazon-devices/kepler-media-controls` `1.0.25` & `@amazon-devices/kepler-media-types` `1.0.0`)
- **How we used it:** Integrated `KeplerMediaControlClient` into `vega/media-control.ts` and `vega/App.tsx` for cross-app media endpoint discovery, capability inspection, playback commands (`play`, `pause`, `stop`), and sampled session state alongside `Linking.canOpenURL` / `Linking.openURL`.
- **What worked well:** TypeScript interfaces for endpoint identity, advertised capabilities, and explicit client cleanup (`destroy()`) are clean and well-structured for unit testing.
- **Suggested improvement:** Include a lightweight mock media-provider fixture inside the Vega Virtual Device image so developers can test cross-app `KeplerMediaControlClient` discovery and playback commands end-to-end inside the simulator without requiring third-party commercial streaming apps to be installed.

### 3. Amazon Bedrock (`amazon.nova-2-sonic-v1:0` & `us.amazon.nova-2-lite-v1:0`) and Amazon Transcribe Streaming
- **How we used it:** Bidirectional HTTP/2 speech-to-speech streaming and tool use (`perform_world_action`) via `InvokeModelWithBidirectionalStreamCommand` for Pip’s live 24 kHz voice, Movie Night recommendations, and spoken TV playback controls; `Amazon Transcribe Streaming` for optional hands-free room transcription.
- **What worked well:** **Amazon Nova 2 Sonic** (`tiffany`, `amy`, `olivia` voices) delivers remarkably warm, low-latency conversational phrasing and supports mid-stream tool calls (`tv-pause`, `dance`, `cold`) plus `SPECULATIVE` vs. `FINAL` text stages for responsive live captions.
- **Friction / Observation — Audio Clock Requirement for Text-Prompted Turns in Nova 2 Sonic:**
  - *Task:* Send a text turn (`textInput` with `role: "USER"`) into an active `amazon.nova-2-sonic-v1:0` session (for example, when a viewer submits a Movie Night text prompt or co-watch question while their mic is muted) and receive spoken `audioOutput`.
  - *Expected:* Sending `textInput` + `contentEnd` triggers an assistant speech response immediately, or `promptEnd` works without an `AUDIO` block.
  - *Actual:* Ending a prompt without an `AUDIO` content block throws `Prompt [...] must have at least one audio content`, and an open `AUDIO` content block requires continuous silent PCM clock frames (`16 kHz` `Buffer.alloc(3200)`) for the model to advance and stream back `audioOutput` after a `textInput` turn.
  - *Workaround:* Keep a lightweight 100ms silent PCM clock running on the open `AUDIO` input block whenever the microphone is muted or text-prompted speech is requested (`public/voice.js`, `lib/speech.mjs`, `lib/movie-night.mjs`).
  - *Suggestion:* Document the silent-PCM clock pattern for mixed text-in / audio-out turns in the Nova 2 Sonic developer guide, or allow `textInput` turns to advance generation without requiring incoming silent audio frames.

### 4. AWS EC2 Mac Dedicated Hosts (`mac-m4.metal` / `mac2.metal`) & AWS Systems Manager (SSM)
- **How we used it:** Provisioned headless macOS Sequoia Dedicated Hosts to run the official ARM64 Vega Virtual Device with zero inbound security group ports, tunneling simulator WebView traffic and framebuffer capture over SSM Session Manager.
- **Friction — First-Boot APFS / EBS Throughput Sensitivity on EC2 Mac:**
  - *Task:* Launch macOS Sequoia on a Dedicated Host and wait for `amazon-ssm-agent` registration.
  - *Actual:* Lowering the root `gp3` volume below the AMI’s baseline `5000 IOPS / 500 MiB/s` or interrupting first-boot APFS container resize with an early `RebootInstances` / `ReplaceRootVolume` stalls initialization (`StatusCheckFailed_System = 1`, `NetworkIn = 0`), requiring instance termination and a ~70-minute Dedicated Host scrub before reuse.
  - *Workaround:* Enforce `gp3` `5000 IOPS / 500 MiB/s` unencrypted root volumes in launch templates with no blocking `UserData` and allow first boot to complete uninterrupted.

---

## Devpost Thumbnail & Image Gallery Guide

- **Submission Thumbnail (`1200×800`, 3:2):** `artifacts/devpost-thumbnail-1200x800.png` (or `.jpg`)
- **Gallery Image 1 (`artifacts/devpost-gallery-01-movie-shelf.png`):** *Movie Night with Pip — Pip listens to tonight’s mood, speaks her recommendation aloud in 24 kHz Amazon Nova 2 Sonic voice, and narrows the shelf to Big Buck Bunny (Open Film) and Paddington (Prime Video handoff).*
- **Gallery Image 2 (`artifacts/devpost-gallery-02-cinema-player.png`):** *Hearth Cinema Player — Watching Big Buck Bunny together after a spoken phone request triggered `tv-pause` and verified the TV player’s `PAUSED` state.*
- **Gallery Image 3 (`artifacts/devpost-gallery-03-vega-simulator-cozy.png`):** *Official ARM64 Vega OS Simulator (`hearth-vega-aarch64.vpkg`) — Hearth running at 1920×1080 in Cozy mode with 10-foot D-pad focus and persistent memory.*
- **Gallery Image 4 (`artifacts/devpost-gallery-04-vega-simulator-cold.png`):** *Official ARM64 Vega OS Simulator — Cold/Atmospheric mode transition via remote D-pad and `kpenter` selection.*
- **Gallery Image 5 (`artifacts/devpost-gallery-05-nova-sonic-dance.png`):** *Live Amazon Nova 2 Sonic Speech-to-Speech & Tool Use — Pip dances by the fire after invoking `perform_world_action(action="dance")` and receiving TV acknowledgment.*
- **Gallery Image 6 (`artifacts/devpost-gallery-06-phone-cowatch.png`):** *Second-Screen Co-Watch & Spoken TV Control — 1080p TV Cinema Player paired via QR code with the live Phone Co-Watch Remote & 16 kHz microphone.*

