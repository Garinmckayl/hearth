# Developer feedback draft

These are implementation observations, not claims about all supported devices. Confirm them against the submitted revision. Never include pairing tokens, emulator authentication tokens, AWS credentials, or private user speech in logs.

## Vega Media Controls client and app-to-app Linking

The media-hub client API is the correct native route for Hearth's cross-app playback controls. The public guide explicitly supports third-party client apps discovering providers, sending playback commands, and retrieving session state. We integrated `@amazon-devices/kepler-media-controls` 1.0.25 and `@amazon-devices/kepler-media-types` 1.0.0 with the React Native 0.83 wrapper. ARM packaging and unit tests succeed; runtime interoperability and Prime availability remain unverified.

What worked: published client interfaces include endpoint package identity, advertised capabilities, play/pause/stop, sampled position, metadata lookup, and explicit client destruction. The deep-link guide documents `Linking.canOpenURL` and `openURL` for app-to-app contracts. These are materially better foundations than Fire OS-only ADB automation for this project.

Suggested improvement (not a claimed SDK defect): provide a runnable media-hub sample and a simulator provider fixture showing client discovery, explicit app selection, capability checks, command acknowledgment versus observed state, metadata omissions, and resource cleanup. A simulator app/endpoint inventory would also make it easier to distinguish generic media-hub support from the availability of a particular commercial provider. We would use the API again; final runtime feedback should follow the actual simulator test.

## Amazon Vega SDK and WebView

Used for packaging a React Native wrapper, rendering Hearth through WebView, and running on Amazon's official simulator. SDK 0.24.12112, CLI 1.4.4, Vega OS 1.2, WebView 4.0.2; successful rendering on the ARM simulator hosted on an AWS M4 Mac.

What worked: a validated package renders the existing web experience, preserving the SVG character and TV-oriented interaction. Authenticated console framebuffer capture provides direct evidence of the runtime. We would use this route again for a web-based TV experience, with an architecture compatibility check first.

### Friction: simulator architecture compatibility

- Task: install a package using WebView 4 on the official Linux x86_64 simulator.
- Steps: boot SDK 0.24.12112's virtual device with working KVM, validate the package, then run the install/launch command.
- Expected: the simulator supports the package's required WebView module, or tooling identifies the mismatch before provisioning/building.
- Actual: installation fails with `Module dependency not found` for `/com.amazon.kepler.webview_4@IWebview_4`; the published WebView package advertises `sim_tv_aarch64`, not the tested x86 simulator.
- Severity: blocking for this architecture and application dependency, not a general simulator outage.
- Workaround: build for aarch64 and use the official ARM simulator on Apple Silicon; Hearth visibly renders there.
- Suggestion: publish a simulator/module compatibility matrix and fail early during project doctor or package validation when the chosen target lacks a required module.

### Friction: remote OK event naming

- Task: activate a focused control through the official simulator remote input path.
- Steps: send the simulator OK key (`kp_enter`) through its private QMP input socket; inspect native TV events and attempt activation.
- Expected: documented select handling activates the focused item.
- Actual: this runtime delivers `eventType: "kpenter"`. Handling only `select` misses it.
- Severity: important; directional focus works while activation can appear broken.
- Workaround: explicitly map `kpenter`, `enter`, and `select` to the web Enter action and ignore release events. A remote-selected reply then changes Pip's dialogue.
- Suggestion: document simulator-specific event names or normalize OK consistently across supported input paths; include a key-event diagnostic example.

### Friction: startup exit status

- Task: automate simulator startup followed by app installation.
- Steps: run official virtual-device startup on a host where boot reaches its timeout/failure path; inspect exit status and subsequent app installation.
- Expected: a failed startup returns a nonzero status suitable for automation.
- Actual: observed startup failure output with exit status zero. A successful process exit alone does not prove the app can install or render.
- Severity: important for CI and setup diagnostics.
- Workaround: reject known failure output and actually install/launch after startup; cover this behavior in launcher tests.
- Suggestion: return nonzero exit codes for failed readiness checks and expose structured readiness/error output.

## Voice and attention services

Amazon Bedrock Nova Sonic supplies Pip's live speech; configured Nova dialogue supports text interactions. Amazon Transcribe supplies room-speech transcripts for optional hands-free mode. Jev through OpenRouter classifies whether transcripts appear directed to Pip. These components have been exercised in the browser prototype; do not describe simulator audio as verified until the target acceptance check passes.

The combination enables playful conversation and actions without repeated wake words, but requires explicit consent about where room speech is processed. Classification is experimental and does not guarantee echo rejection. Final submission feedback should add concrete onboarding and reliability observations from the actual target test rather than inventing API problems.

## Remaining feedback inventory

### React Native for Vega (`@amazon-devices/react-native-kepler`)

- **Purpose:** Native TV application shell hosting the Hearth WebView, hardware remote event routing (`useTVEventHandler`, `BackHandler`), splash-screen lifecycle (`usePreventHideSplashScreen`, `useHideSplashScreenCallback`), and foreground/background `AppState` transitions.
- **What worked:** Clean lifecycle hooks and straightforward bridge injection into WebView (`injectedJavaScriptBeforeContentLoaded` and `injectJavaScript`). Unit testing under Jest with mocked native modules is fast and deterministic.
- **What needs work:** Clearer documentation on `eventKeyAction` press/release filtering and simulator key-code normalization (`kpenter` vs `select`).
- **Would use again:** Yes, for Vega TV shells requiring native platform bridges around rich web/canvas scenes.

### Authored SVG/CSS Character Rig and Built-In HTML5 Cinema Player

- **Purpose:** Render Pip's autonomous expressions, gestures, cozy/cold living room, and built-in Movie Night HTML5 video player at 1920×1080 without proprietary animation runtimes.
- **What worked:** Zero external runtime binary dependencies inside the WebView, deterministic Playwright verification, and direct HTTP byte-range (`206 Partial Content`) film streaming with real playback position telemetry.
- **What needs work:** Complex multi-prop animations require careful state cleanup (`actions.js`) so speech interruptions cancel pending gesture timers cleanly.
- **Would use again:** Yes.

### Node.js + WebSocket Phone Pairing and Co-Watch Bridge

- **Purpose:** Let a viewer pair their phone via QR code to stream microphone PCM audio to Amazon Bedrock Nova 2 Sonic, relay captions and TV tool calls (`tv-pause`, `tv-resume`, `tv-recommend`), and keep the voice companion alive even when the TV WebView backgrounds during external app handoff.
- **What worked:** Explicit owner-authorized bridge tokens (`crypto.timingSafeEqual`), origin validation, and wait-for-TV-acknowledgment tool responses prevent hallucinated playback state.
- **What needs work:** Mobile browser microphone capture requires the phone tab to stay foregrounded.
- **Would use again:** Yes.

### AWS EC2 Mac Dedicated Hosts & Systems Manager (SSM) for ARM Vega Simulator

- **Purpose:** Provision disposable Apple Silicon (`mac-m4.metal` / `mac2.metal`) hosts to run the official ARM64 Vega Virtual Device headlessly via SSM Session Manager port forwarding.
- **What worked:** Zero-inbound security groups with SSM port forwarding (`19081 -> 19080`) and QMP/console framebuffer capture allow fully automated headless verification without exposing VNC.
- **Friction — EC2 Mac first-boot EBS IOPS/throughput sensitivity:**
  - *Task:* Boot macOS Sequoia on `mac2.metal` over EBS and wait for SSM registration.
  - *Steps:* Override the AMI default root volume (`5000 IOPS`, `500 MiB/s` unencrypted) down to `3000 IOPS`, `125 MiB/s` with forced KMS encryption on first boot, then issue a reboot after 11 minutes when SSM has not yet registered.
  - *Expected:* Slower boot, or clear progress telemetry in EC2 console output.
  - *Actual:* APFS container initialization over Nitro EBS stalls and interrupting first boot with an early `RebootInstances`/`ReplaceRootVolume` leaves the instance unreachable (`StatusCheckFailed_System = 1`, `NetworkIn = 0`) until termination and host scrub.
  - *Workaround:* Preserve the AMI's baseline `5000+ IOPS` and `500 MiB/s` throughput without forced re-encryption on snapshot hydration, omit blocking `UserData`, and allow uninterrupted first-boot completion before any recovery action.
- **Would use again:** Yes, with high-throughput EBS settings enforced in launch templates.
