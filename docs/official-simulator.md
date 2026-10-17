# Official simulator evidence

## Native media-control integration — October 16, 2026

The updated wrapper integrates Amazon's official Vega Media Controls client and app-to-app Linking, not the Fire OS-only ADB bridge. It discovers media endpoints, requires an explicit provider selection, dispatches supported play/pause/stop commands, and samples provider state/metadata. Title-specific launch URLs are empty by default; fixed Prime HTTPS home/search links also require installed-handler checks. The ARM package builds and passes VPT validation; 15 native component/unit tests pass. Browser tests use a simulated bridge, not an actual simulator.

This version has **not yet executed on the official ARM simulator**. Previous screenshots below establish rendering of the earlier version, not successful media control or Prime Video availability. The authorized M1 dedicated host became available, but its instance failed startup reachability checks before SSM access. Recovery and an older-image boot-volume replacement are in progress as documented in `cloud-simulator.md`. The bounded worker will test actual open-film playback, spoken pause and endpoint discovery when remote access is restored. See `tv-control.md` for official API references and the remaining runtime gate.

## Verified ARM execution — October 13, 2026

Hearth installs, launches, and visibly renders on Amazon's official ARM Vega Virtual Device, SDK 0.24.12112 / OS 1.2, on the disposable AWS M4 Mac described in `docs/cloud-simulator.md`. The simulator's own authenticated console captured the framebuffer at 1920×1080; these are not browser-preview screenshots.

- `artifacts/hearth-official-vega-arm-home.png`: rendered home.
- `artifacts/hearth-official-vega-arm-verified-select.png`: remote-selected reply changes Pip's dialogue.
- Multiple captures show Pip moving between watering and reading behaviors.
- Native remote handling supports the simulator's actual `kpenter` event, directional keys, release filtering, and Back routing. Eight component tests and 34 Node tests pass; TypeScript and VPT validation pass.
- `scripts/vega-qmp.py` sends keys through the simulator's private local QMP socket. Run it as the simulator owner on the Mac, using the SDK's bundled Python if necessary. Do not expose this socket or the emulator console publicly.
- Phone pairing, uninterrupted Sonic audio, and a complete recording are **not yet verified on this simulator host**. Do not present this as full end-to-end voice certification.

The unsuccessful Linux attempts documented below are historical investigation, not the current ARM result.

The competition requirement accepts **an actual Fire TV device OR the official Fire TV/Vega simulator**. Physical hardware is not mandatory. The existing browser `?tv=1` view is useful for design testing but is not either of those things.

## Current evidence

- Automated browser and backend tests pass locally.
- The Android TV debug APK builds and its signature verifies.
- Nova Sonic voice has been exercised through the public HTTPS/WebSocket preview.
- Amazon Vega CLI 1.4.4 and SDK 0.24.12112 are installed on the development server; the bundled virtual image targets Vega OS 1.2.
- The separate `vega/` application compiles into `artifacts/hearth-vega-x86_64.vpkg`, and Amazon VPT validates the package. SDK Project Doctor passes its critical checks.
- Native wrapper tests cover loading, storage, lifecycle cleanup, retry, HTTP errors, and Back handling. These use mocked WebView components, not inference or device rendering.
- Official simulator startup was attempted on both the default instance and a fresh image, with GUI/software-graphics variants and one/four CPU configurations. The guest boots, but platform services fail before Hearth can install: `vdcm` cannot read the device type, and the compositor is unavailable. Hearth has **not** rendered on the official simulator here. A package build or a “Virtual device ready” message alone is not app evidence. Do not label existing browser screenshots as official simulator footage.

## Official Vega route

### Cloud host verification (October 13)

A separate `m7i.xlarge` with nested virtualization enabled successfully booted the official simulator with KVM acceleration. Installation then failed because the x86_64 image lacks `/com.amazon.kepler.webview_4@IWebview_4`. The published WebView package lists physical Fire TV and `sim_tv_aarch64` targets, not the Linux x86_64 simulator. Do not strip this required module from the manifest to bypass compatibility checks. The subsequent ARM Mac test succeeds as described above. See `docs/cloud-simulator.md` for the disposable hosts and cleanup details.

Start with Amazon’s versioned documentation and recheck the supported version before installation:

- https://developer.amazon.com/docs/vega/0.24/setup-overview.html
- https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html
- https://developer.amazon.com/docs/vega/0.24/overview-of-webview

Use a host that meets Amazon’s published SDK and virtual-device prerequisites. On this Ubuntu development host `/dev/kvm` is unavailable. The official virtualizer falls back to TCG software emulation, but this is slow and does not establish usable app rendering by itself. Hardware acceleration is strongly recommended.

The Android APK targets Android/Fire OS. It is **not a Vega application package**. The separate Vega application uses Amazon WebView 4.0.2, opens the existing HTTPS Hearth home in TV mode, enables DOM storage and remote key delivery, stops conversation when backgrounded, and offers retry if the home cannot load. It does not bundle an offline copy of the home. The phone supplies microphone input; direct Vega microphone capture is not implemented.

```bash
npm ci --prefix vega
HEARTH_BACKEND_URL=https://YOUR_HEARTH_HOST npm run build:vega
npm run simulator
```

On Apple Silicon the default build architecture is `aarch64`; on x86 hosts it is `x86_64`. Set `HEARTH_VEGA_TARGET` consistently for build and launch if overriding it. Keep the HTTPS backend online and rebuild after a temporary tunnel URL changes.

Use `npm run simulator -- --headless --software-graphics` for a headless Linux launch. `HEARTH_SIMULATOR_TIMEOUT` accepts 60–3600 seconds and defaults to 1200. The official CLI can return exit code zero after a boot deadline, so the launcher also runs the actual install/launch command instead of treating startup exit status as app validation.

### Observed setup friction

- Starting while the SDK installer is still extracting the image produces missing `vmtools` or `qemu-img` errors. Wait for the complete installer to finish.
- A 120-second boot deadline was insufficient on this non-KVM host and stopped the virtualizer. Longer deadlines permit further boot progress.
- A first initialization restarted the guest. Verify that it reconnects before installing an app; run the start command again if the virtualizer exited.
- GUI launches need a live display server. An invalid `DISPLAY` caused a Qt `xcb` startup failure. The SDK retained a stale running PID after this failure; its stop command clears the instance state before retrying.
- The template’s default build number zero failed standalone VPT validation. The build helper now supplies build number 1 and validates the finished package.
- A fresh guest reported timeouts waiting for `dev-tty0.device` and `dev-uinput.device`, with dependent Weston compositor/animation startup failures. The nodes appeared later. Failed units also included `aacedataKvs.service`, `kvs_util.service`, and `stemd.service`. `run-app` then failed because `com.amazon.device-config.service` was unavailable. Longer host-side deadlines did not repair these guest-side failures. This server lacks KVM; repeat the test on a supported hardware-accelerated host rather than changing the guest’s security policy or pretending browser output is device footage.

These are local observations, not submitted competition friction logs. Do not claim that a longer timeout fixes every host compatibility problem.

## Capture acceptance checklist

1. Show the official virtual device or actual Fire TV launching Hearth, with the target runtime identified.
2. Demonstrate focus, directional controls, select/back, readable captions, and a usable TV viewport.
3. Show real Sonic conversation or phone pairing, including interruption and stopping the microphone.
4. Save a user-approved moment, restart the application, and demonstrate continuity.
5. Show a choice changing the home, plus a user-controlled real-world connection prompt.
6. Record the screen directly. Keep the submission video under the rule’s stated time limit; distinguish guided story steps from live AI.

Document real compatibility issues as friction feedback with the SDK/OS version, reproducible steps, observed behavior, workaround, and suggested improvement. Do not invent friction reports or user-research results.
