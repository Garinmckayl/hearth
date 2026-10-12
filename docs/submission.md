# Hearth competition preparation

## Positioning

**Hearth — Someone’s here.** A persistent, interactive television home that gives an older adult a little company and supports small connections with the people they care about. The interaction is designed around silence, remote control, memory, and a world that visibly changes with a relationship.

## Verified requirements

Reviewed the [Amazon Developer 2026 competition page](https://amazonappdev2026.devpost.com/) on October 11, 2026. The displayed deadline is October 23, 2026, at 3 PM EDT. Recheck the official rules before submitting.

The Fire TV track accepts web technologies or Android Java/Kotlin, among other frameworks, provided the application runs on Fire OS or Vega OS. The submission video must show it running on an actual Fire TV device or the Fire TV/Vega simulator. A generic desktop browser or Android emulator is not sufficient evidence for that requirement. The page calls for a public, English demo video under three minutes, a code repository, and product feedback. Optional friction logs can earn a judging bonus of up to 10%.

Judging covers technical implementation, design, potential impact, and quality of the idea. Hearth’s strongest evidence is the interplay between remote controls, meaningful continuity, autonomous animation, and a real-world connection prepared with user control.

## 75-second demonstration

| Time | What to show | What it proves |
| --- | --- | --- |
| 0–15s | Fire TV launch; Pip blinks, moves, and tends the fern. Select a reply with the physical remote. | A living home and a TV interaction model. |
| 15–30s | Tell Pip about the recital. Advance the demo day and show its follow-up. | Persistence across visits, not an isolated prompt. |
| 30–45s | “She was wonderful”; show the drawing appearing. “The house feels quiet”; show Pip’s thoughtful response. | Choices affect character behavior and the world. |
| 45–60s | Prepare the note; show that sharing remains user-controlled. | Connection beyond the television. |
| 60–75s | Confirm an arranged call only if demonstrating that user action; advance the day and show the appropriate follow-up. | Continuity without claiming an unperformed action. |

The guided demo is explicitly scripted. If demonstrating live AI, enable the configured Bedrock connection and show a free-form input separately. Do not represent scripted story replies as generated responses, synthetic time jumps as background activity, or a prepared note as a sent message.

## Remaining before entry

- Install and exercise the APK on a Fire TV device or official simulator; record that device in the demo.
- Validate remote focus, select/back, display safe zones, WebView support, speech availability, and sustained animation performance on the target model.
- Record the already-tested Nova 2 Sonic voice and Nova 2 Lite dialogue on the target television. Use phone pairing if its remote does not expose raw microphone audio.
- Use the authored SVG/CSS animation pipeline; Rive is not required. Describe phone pairing and Sonic accurately; do not claim direct Alexa integration.
- Test the experience with older adults and replace assumed benefits with specific observed feedback.
- Prepare the repository, demo link, screenshots, product feedback, and release signing if distribution is required.

## Developer feedback log

No fabricated product friction reports are included. One implementation finding to validate on hardware is voice availability: an Android recognizer intent and a Fire TV voice remote are different integration paths. Record the target model, Fire OS version, attempted action, observed behavior, workaround, severity, and an actionable Amazon-facing suggestion after testing it on the actual device.
