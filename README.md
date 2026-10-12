# Hearth — Someone’s here

An interactive television home for an explicitly fictional companion named Pip. Pip tends plants, watches the garden, warms up by the fire, remembers moments you choose to keep, and helps you take small steps toward real-world connection.

## Open the home

Requires Node.js 22.9 or later.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Add `?tv=1` for the television layout. Use arrow keys and Enter, a mouse, or touch. Escape closes a panel. The scene toolbar includes spoken replies and fullscreen. Choose **Try the story demo** in the footer for the recital-to-reconnection story.

## What works

- Independent character behavior, breathing, blinking, tail movement, fire, clouds, and local time lighting.
- Device-local memory and preferences; next-day follow-ups; a growing fern and a recital drawing that change the world.
- Six-step story demo with explicit day advancement. Real memories persist through reloads.
- Solo fireside game and two-person Room Mode with a remote passed between players.
- Typed conversation, selectable replies, optional browser speech recognition, and spoken captions.
- Spatial directional navigation, modal focus containment, reduced-motion support, larger text, and layouts for 1080p, 720p, and compact TV WebViews.
- Confirmed memory forgetting and full reset. New AI-generated memories require confirmation before saving.
- Share-sheet or clipboard message preparation. Hearth never sends a message or arranges a call automatically.
- Real-time Amazon Nova 2 Sonic speech with Tiffany (US), Amy (UK), or Olivia (AU) feminine voices, live captions, interruption, and microphone pause/end controls.
- Phone-to-TV microphone pairing with a private QR link: voice plays in Pip’s home while a phone supplies the microphone. Unjoined QR links expire after fifteen minutes; connected pairing stays active until disconnected.
- Plant sunflowers or moonflowers, choose a branching Lantern Path story, enjoy a firefly quiet minute, and change the home’s weather.
- Optional silent invitations after a quiet pause; remembered follow-ups take priority without interrupting voice or stealing focus. Choosing quiet suppresses invitations for that visit.
- Pip’s fireside dance, optional original synthesized tune, waving, giggling, stretching, watering, reading, and sitting. Nova Sonic can invoke validated world actions and receives an acknowledgment from the television before claiming success; phone pairing relays actions too.

## Fire TV APK

The Android application bundles the web experience locally, exposes TV launcher metadata, runs in landscape, and handles D-pad/select/back controls. Android speech recognition and text-to-speech are used when available. A Fire TV voice remote does not automatically provide a supported Alexa conversation API; missing recognizers fall back to selectable replies.

```sh
JAVA_HOME=/path/to/jdk17 ANDROID_HOME=/path/to/android-sdk npm run build:android
adb connect FIRE_TV_IP:5555
adb install -r artifacts/hearth-firetv-debug.apk
adb shell am start -n com.hearth.tv/.MainActivity
```

The build needs Gradle 8.14.3, JDK 17, Android SDK platform 35, and accepted SDK licenses. Set `GRADLE_BIN` when Gradle is not on PATH. The script also finds a cached Gradle 8.14.3 distribution if present. It builds the web assets for Chromium 70 syntax compatibility before packaging them. The generated debug APK is for sideloading and testing, not an Appstore release. Fire OS device/WebView compatibility, voice availability, performance, and actual remote behavior still need on-device verification. No Fire TV device was attached during development.

## Optional connected AI

The default story engine works without credentials. For real free-form conversation, copy `.env.example` to `.env`, set `BEDROCK_MODEL_ID` to a model or inference profile available to your account, and set `AWS_REGION`. Use your normal AWS SDK credentials or an IAM role with scoped model invocation permissions. Credentials stay on the server. Restart the server, then enable **Connected AI dialogue** in Settings.

The Bedrock Converse request has an explicit output-token cap, bounded context, a timeout, and validated JSON output. A failed provider request falls back to the local story. Real Nova 2 Lite dialogue and Nova 2 Sonic audio were tested, including microphone PCM streaming through the Cloudflare preview. Automated tests use mocked providers to avoid charges. Optional guardrail settings require an existing guardrail with a pinned version.

For warm voice, set `NOVA_SONIC_ENABLED=true` and `NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0`. Use IAM credentials with bidirectional model invocation permission: Bedrock API keys do not support this streaming API. Choose **Talk with Pip → Speak with Pip, naturally → Start our conversation**, or **Use your phone as microphone**. Audio uses 16 kHz PCM input and 24 kHz PCM playback. Microphone starts only with explicit consent; voice streams renew automatically while the microphone stays connected; at most two concurrent streams are allowed. A supported secure-context browser with AudioWorklet is required for microphone capture. Scripted story replies use Amazon Polly’s generative Tiffany/Amy/Olivia voices so the spoken script matches the captions; conversational Nova Sonic is not treated as a verbatim TTS engine. The server also needs `polly:SynthesizeSpeech` permission and a region supporting those generative voices (`POLLY_REGION` defaults to `AWS_REGION`). Polly returns 16 kHz PCM wrapped as WAV. Live dialogue remains Nova Sonic.

Choose **Start in Pip’s home** to converse while the character stays visible. Try “Show me your little dance,” “Tell me a joke,” “Wave hello,” “Could we have rain at the window?” or “Let’s plant moonflowers.” The model calls a bounded `perform_world_action` tool; only whitelisted fictional-world actions can run. Missing/failed TV acknowledgments are returned as failures after five seconds. Mouth movement responds to playback audio energy, and listening/thinking poses respond to conversation events. Actions do not call people, send messages, operate physical devices, or activate microphones. The manual dance and surprise activities also work in offline story mode. The tune plays only when explicitly requested.

Real generative Polly Tiffany speech and Sonic dance-tool invocation have been tested. A browser check also passed with synthesized microphone input through the public Cloudflare link, real Sonic inference, a visible dance in the home, and a real browser action acknowledgment. The isolated WebSocket check uses a test-client acknowledgment; automated regression tests use mocked inference to avoid charges. These checks are not a substitute for human usability research or official simulator submission footage.

The `?tv=1` preview is a browser layout, **not an official Fire TV simulator**. The Android APK is an actual installable TV wrapper, not proof of Fire TV compatibility. Official Vega virtual-device testing requires Amazon’s SDK and KVM; this development host has no `/dev/kvm`. Test the APK on actual Fire OS hardware with `npm run firetv -- DEVICE_IP:5555 --install`. Vega OS requires a separate compatible Vega package.

For a controlled native AI demo, serve the backend at an HTTPS origin, set `ALLOW_NATIVE_CLIENT=true` on the server, and build with:

```sh
HEARTH_BACKEND_URL=https://your-backend.example npm run build:android
```

The native app will discover that backend and expose the same opt-in setting. The backend defaults to localhost; configure `HOST` and HTTPS termination for remote access. The included server is a development server with basic concurrency/rate limits. Add authenticated access and proper production hosting before exposing paid model inference publicly.

## Privacy and honest boundaries

### Hands-free company with Jev

Set the server-only `OPENROUTER_API_KEY` and optionally `JEV_MODEL_ID=~typesafe/jev-latest`. Enable Nova Sonic as described above and grant `transcribe:StartStreamTranscription` to the AWS identity. Choose **Talk with Pip → Speak with Pip, naturally → Hands-free company → Use your phone as microphone**. Scan the private QR link, press **Enjoy our home** on the TV, then explicitly start the phone microphone. **Start in Pip’s home** also works with a microphone on the same browser.

The pipeline is phone PCM → Amazon Transcribe Streaming → Jev Decisions API → accepted text → Nova Sonic → TV speech and acknowledged character actions. Jev is the attention classifier, not a replacement conversational model or a model-routing service. No repeated wake word is required; context from accepted conversation helps identify follow-up answers. Uncertain decisions or provider failures keep Pip quiet. Direct **Just us** mode remains available without Jev.

Starting the microphone creates a sixty-second opening window: Jev receives the fact that the user explicitly started a conversation, so unnamed greetings and audio checks can initiate it. Side-conversation and echo screening still apply. After the first accepted turn, recent conversation drives attention instead. If an uncertain turn is ignored, the UI explains how to get Pip’s attention rather than labeling it as a side conversation.

Ambient room audio goes to Amazon Transcribe; final transcripts and recent accepted turns go to Jev through OpenRouter, **including speech Pip ignores**. Ignored speech is not sent to Sonic, returned as captions, or stored by Hearth. All people in the room should consent. Pause or end the microphone at any time. Connected sessions have no application time limit. Voice streams renew every four minutes, carrying the last eight accepted conversation turns and microphone pause state; a brief response gap can occur during renewal. Classification is limited to 30 decisions per rolling minute. These paid services require production access controls before broader deployment.

This prototype waits for final transcription, a 1.5-second turn-grouping window, and semantic classification before replying or interrupting playback. It is not instant full-duplex speech-to-speech: Sonic receives accepted text rather than original vocal prosody in ambient mode. Browser echo cancellation and Jev echo screening are not a guarantee of acoustic cancellation, particularly with a phone microphone and separate TV speakers. Misclassification is possible; do not use this as emergency monitoring.

Live validation includes real synthetic microphone PCM through Transcribe, Jev, and Sonic, with a dance tool call and test-client acknowledgment. To repeat that paid check, use `HEARTH_TEST_MODE=ambient HEARTH_TEST_PCM=/path/to/synthetic-16k.pcm HEARTH_EXPECT_ACTION=dance node scripts/check-live-voice.mjs`. The browser phone check uses a synthetic microphone WAV: `HEARTH_TEST_WAV=/path/to/synthetic.wav node scripts/check-ambient-phone.mjs`. Synthetic checks do not establish reliability in noisy homes or replace older-adult usability research.

Saved memory is browser/WebView localStorage, not encrypted or cloud-synchronized. Remembering can be paused; earlier memories are retained but excluded from dialogue context while paused. Individual forgetting clears conversation context, and forgetting the recital removes its dependent drawing and follow-up. Clearing everything also removes the name and preferences. Conversation history for connected dialogue is held only in page memory. Connected mode sends approved memory context and conversation to Bedrock. Browser/device speech providers may process audio remotely; Hearth does not record audio.

Pip is fictional and does not provide healthcare or emergency monitoring. The character and environment use authored SVG/CSS animation with application-controlled behavior. Rive is not required or included; see `docs/animation.md` for the free animation pipeline. Direct Alexa integration is not implemented. Activity runs only while the app is active, with no background surveillance or continuous microphone access. Physical Fire TV hardware is optional for the competition: official simulator footage also qualifies. See `docs/official-simulator.md` for the remaining evidence requirements.

## Validation and artifacts

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

The static build is in `dist/`; static hosting runs in story mode. The local Node server provides the optional AI endpoints. Screenshots and the Android debug APK are in `artifacts/`. See `docs/submission.md` for the competition demo plan and outstanding submission work.
