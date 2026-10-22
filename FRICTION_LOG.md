# Hearth: Movie Night with Pip — Developer Friction Log (Amazon Developer Hackathon 2026)

**Project:** Hearth: Movie Night with Pip ("Your TV Has Someone In It")  
**Repository:** https://github.com/Garinmckayl/hearth  
**SDKs & Services Tested:** Vega OS SDK `0.24.12112` (`aarch64` & `x86_64`), `@amazon-devices/webview`, `@amazon-devices/kepler-media-controls`, Amazon Bedrock Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`), Amazon Bedrock Nova 2 Lite (`amazon.nova-2-lite-v1:0`), Amazon Transcribe Streaming (`@aws-sdk/client-transcribe-streaming`).

---

## Friction Item 1 — `vega virtual-device start` Hangs on Headless / Remote Hosts Without GUI Display
- **Specific Task Attempted:** Start the official Vega Virtual Device (`vvd`) from the command line on a remote/headless build or test machine for automated CI and simulator validation.
- **Steps Taken:**
  1. Installed Vega SDK `0.24.12112` and initialized the virtual device image.
  2. Ran `vega virtual-device start` over an SSH / non-GUI session.
- **Expected vs. Actual Result:**
  - **Expected:** Either a `--headless` flag that boots the guest OS with an offscreen surface, or an immediate preflight diagnostic stating that a GUI display server (`DISPLAY` / WindowServer) is required.
  - **Actual:** `vega virtual-device start` blocks indefinitely waiting for a GUI display surface and times out without a clear diagnostic message explaining why the simulator failed to initialize.
- **Severity Rating:** High (Blocker for CI/CD pipelines and headless Linux/macOS cloud builders).
- **Workaround Used:** Provisioned a dedicated Apple Silicon (`arm64`) macOS host with an active GUI session (`~/kea/sdk/v0.24.12112`), forwarded simulator control (`8383`) and WebDriver (`4444`) ports over SSH to the remote test runner, and built `scripts/launch-vega-simulator.mjs` to automate install, launch, and screenshot/video capture across the tunnel.
- **Actionable Suggestion:** Add a native `vega virtual-device start --headless` mode (using offscreen EGL/SwiftShader) for CI testing, and emit an explicit preflight error if no GUI display is attached when `--headless` is not passed.

---

## Friction Item 2 — `vega device install-app` and `launch-app` Exit With Code `0` When App Installation or Launch Fails
- **Specific Task Attempted:** Automate `.vpkg` installation (`hearth-vega-aarch64.vpkg`) and component launch (`com.hearth.tv.main`) inside automated test scripts.
- **Steps Taken:**
  1. Ran `vega device install-app -p artifacts/hearth-vega-aarch64.vpkg` and `vega device launch-app -a com.hearth.tv.main` from an automated Node.js launcher (`scripts/launch-vega-simulator.mjs`).
  2. Inspected the process exit code (`$?`) when the target device was disconnected or the package path/component ID was invalid.
- **Expected vs. Actual Result:**
  - **Expected:** Non-zero exit code (`!= 0`) whenever package installation, manifest validation, or component launch fails.
  - **Actual:** The CLI frequently exits with code `0` even when `stdout`/`stderr` contains `Error:`, `Failed to install`, or `Device not found`.
- **Severity Rating:** Medium (Causes false-positive CI passes unless stdout/stderr is parsed manually).
- **Workaround Used:** Wrote strict output-parsing guards in `scripts/launch-vega-simulator.mjs` (verified by unit tests in `tests/simulator.test.mjs`) that inspect combined `stdout`/`stderr` for failure signatures (`error`, `failed`, `not found`, `unable`) and reject the step even when exit code is `0`.
- **Actionable Suggestion:** Ensure all `vega device *` subcommands propagate non-zero exit codes on any transport, installation, or component-resolution error, and support a `--json` output flag for machine-readable status.

---

## Friction Item 3 — `manifest.toml` Rejects Service Components Missing `_service` Suffix With an Opaque Packaging Error
- **Specific Task Attempted:** Declare a background service component in `vega/manifest.toml` alongside the main interactive component (`com.hearth.tv.main`).
- **Steps Taken:**
  1. Added a `[components.service]` entry in `vega/manifest.toml` using a standard reverse-DNS identifier without the `_service` suffix.
  2. Ran `vega build` to package the `.vpkg`.
- **Expected vs. Actual Result:**
  - **Expected:** Either any valid reverse-DNS component ID is accepted, or the manifest validator outputs a clear schema error explaining the naming convention (`Service component IDs must end with '_service'`).
  - **Actual:** Packaging failed with an opaque manifest validation error that did not clearly state the required `_service` suffix rule or how `[wants]` / `[offers]` entries must cross-reference it.
- **Severity Rating:** Medium (Slows down initial `manifest.toml` authoring).
- **Workaround Used:** Isolated the interactive application into `[[components.interactive]]` (`id = "com.hearth.tv.main"`) with explicit `runtime-module = "/com.amazon.kepler.keplerscript.runtime.loader_2@IKeplerScript_2_0"` and `categories = ["com.amazon.category.main"]`.
- **Actionable Suggestion:** Improve `vega build` manifest schema error messages to include the exact naming regex and a valid TOML snippet whenever a `[components.*]` identifier fails validation.

---

## Friction Item 4 — `@amazon-devices/webview` Lack of Built-In Local Dev-Server Port Forwarding & WebAudio Autoplay Policy Docs
- **Specific Task Attempted:** Connect the Vega OS WebView (`vega/src/App.tsx`) to the local Hearth Node.js realtime voice/media server (`http://127.0.0.1:4173/?tv=1&mute=0`) and play streamed 24 kHz PCM voice responses from Amazon Nova 2 Sonic.
- **Steps Taken:**
  1. Loaded the local server URL inside `WebView` on the Vega Virtual Device.
  2. Streamed 24 kHz PCM audio from Amazon Bedrock Nova 2 Sonic into WebAudio (`AudioContext`) and synthesized fallback speech via `window.speechSynthesis`.
- **Expected vs. Actual Result:**
  - **Expected:** Documented `vda reverse tcp:4173 tcp:4173` instructions for reaching host services from the Vega Virtual Device, plus clear documentation on `WebView` autoplay/audio-focus policies and `speechSynthesis` availability.
  - **Actual:** Guest-to-host networking setup required trial-and-error with `vda`, and `window.speechSynthesis` inside the embedded TV WebView can lack voices or remain muted until an explicit user key/D-pad gesture unlocks WebAudio.
- **Severity Rating:** Medium.
- **Workaround Used:** Built a dual-path audio pipeline (`lib/sonic.mjs` + `public/voice.js` + `/api/voice/speak`) that synthesizes and streams 24 kHz PCM WAV/WebAudio buffers directly from **Amazon Bedrock Nova 2 Sonic** on the server and plays them through a single unlocked `AudioContext` / HTML5 audio element in the TV WebView.
- **Actionable Suggestion:** Document host-port forwarding (`vda`) and `WebView` media/WebAudio autoplay flags (`mediaPlaybackRequiresUserGesture={false}`) in the official `@amazon-devices/webview` README.

---

## Friction Item 5 — Amazon Bedrock Nova 2 Sonic (`InvokeModelWithBidirectionalStream`) Event Ordering & Speculative Text Filtering
- **Specific Task Attempted:** Build a low-latency, bidirectional speech-to-speech loop with tool calling (`perform_world_action`) using `amazon.nova-2-sonic-v1:0`.
- **Steps Taken:**
  1. Opened a bidirectional stream via `@aws-sdk/client-bedrock-runtime` (`InvokeModelWithBidirectionalStreamCommand`).
  2. Sent `sessionStart`, `promptStart` (with `toolConfiguration`), `contentStart` (audio 16 kHz PCM), `audioInput` chunks, and `contentEnd`.
  3. Parsed `contentStart`, `textOutput`, `audioOutput` (24 kHz PCM), and `toolUse` events.
- **Expected vs. Actual Result:**
  - **Expected:** A high-level Node.js helper or state-machine example showing how to filter `SPECULATIVE` vs. `FINAL` `generationStage` text frames and how to return `toolResult` frames within an active bidirectional prompt without race conditions.
  - **Actual:** `textOutput` emits both `SPECULATIVE` and `FINAL` chunks keyed by `contentId`, and closing the async input iterable too early when a `toolUse` event arrives terminates the session before the model speaks its post-tool confirmation.
- **Severity Rating:** Low–Medium.
- **Workaround Used:** Built a deterministic async queue and `contentId` stage tracker in `lib/sonic.mjs` (tested in `tests/sonic.test.mjs`) that records `generationStage` per `contentId` (rendering only non-speculative captions) and keeps the bidirectional input queue open until `[TV acknowledgment]` is returned as a `toolResult` frame.
- **Actionable Suggestion:** Publish an official TypeScript/Node.js reference state machine in the Amazon Bedrock Nova 2 Sonic documentation covering `SPECULATIVE` vs. `FINAL` `contentId` tracking and multi-turn `toolUse` -> `toolResult` audio continuation.
