# Official simulator evidence

The competition requirement accepts **an actual Fire TV device OR the official Fire TV/Vega simulator**. Physical hardware is not mandatory. The existing browser `?tv=1` view is useful for design testing but is not either of those things.

## Current evidence

- Automated browser and backend tests pass locally.
- The Android TV debug APK builds and its signature verifies.
- Nova Sonic voice has been exercised through the public HTTPS/WebSocket preview.
- No official Fire TV/Vega simulator or Fire TV device has been used yet. Do not label existing screenshots as official simulator footage.

## Official Vega route

Start with Amazon’s versioned documentation and recheck the supported version before installation:

- https://developer.amazon.com/docs/vega/0.24/setup-overview.html
- https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html
- https://developer.amazon.com/docs/vega/0.24/overview-of-webview

Use a host that meets Amazon’s published SDK and virtual-device prerequisites. On this Ubuntu development host `/dev/kvm` is unavailable; installing the SDK alone would not establish working official-simulator support.

The current APK targets Android/Fire OS. It is **not a Vega application package**. For the Vega route, build an official Vega application using its supported WebView APIs, bundle the Hearth web assets, configure its HTTPS backend, and implement the platform’s input and lifecycle contracts. Validate microphone capability rather than assuming Android microphone permissions carry over. Phone pairing is an alternative to direct microphone capture.

## Capture acceptance checklist

1. Show the official virtual device or actual Fire TV launching Hearth, with the target runtime identified.
2. Demonstrate focus, directional controls, select/back, readable captions, and a usable TV viewport.
3. Show real Sonic conversation or phone pairing, including interruption and stopping the microphone.
4. Save a user-approved moment, restart the application, and demonstrate continuity.
5. Show a choice changing the home, plus a user-controlled real-world connection prompt.
6. Record the screen directly. Keep the submission video under the rule’s stated time limit; distinguish guided story steps from live AI.

Document real compatibility issues as friction feedback with the SDK/OS version, reproducible steps, observed behavior, workaround, and suggested improvement. Do not invent friction reports or user-research results.
