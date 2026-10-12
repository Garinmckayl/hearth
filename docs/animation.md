# Pip’s animation pipeline

## Decision

Keep Pip’s authored SVG rig and CSS animation for the interactive character. Use JavaScript to select behaviors and interrupt them for conversation. This costs no editor subscription and already runs in Hearth’s browser and packaged Android WebView.

Do not replace the companion with a looping video or a generic downloaded character. Listening, speaking, thoughtful responses, and everyday activities need independent control. The application owns those states; a decorative animation player does not supply relationship memory or behavior decisions.

## Tool options

| Tool | Useful for Hearth | Trade-off |
| --- | --- | --- |
| SVG/CSS + application state | Pip’s breathing, eyes, tail, props, movement, and conversation reactions | No visual state-machine editor; behavior logic is authored in code |
| Glaxnimate + Lottie | Authoring decorative vector loops such as drifting leaves or fireflies | Exported features must be tested against the chosen Lottie runtime; interactive behavior remains application code |
| Friction | Handcrafted vector/raster animation and promotional sequences | Timeline authoring, not a replacement for a runtime behavior controller |
| Synfig Studio | More elaborate traditional animation and rendered sequences | Better suited to offline production than a reactive TV character |
| Lottielab and other hosted editors | Convenient Lottie authoring | Check current plan limits, export permissions, and asset licenses rather than assuming the whole authoring stack is free |

**Recommended optional addition:** Glaxnimate plus a locally bundled open-source Lottie runtime for background accents only. Add it when an authored asset earns its runtime and download cost. No Lottie dependency is needed just to describe the current animations as interactive.

## Behavior rules

- Conversation takes priority over autonomous activities; idle scheduling must not reset a listening character.
- A bounded action controller replaces older gestures with dances, waves, stretches, giggles, reading and watering. Nova Sonic tools trigger real scene changes, then wait for a television acknowledgment. Conversation poses and audio-energy mouth movement remain independent of the action pose.
- Reduce motion according to the system preference; retain readable captions and controls.
- Stop microphone capture when navigating away, hiding the page, or pausing the native app.
- Invitations stay silent, never steal focus, and appear at most once per page visit after a 90-second pause. Choosing quiet suppresses them for the visit; Settings can disable them persistently.
- Memories inform a follow-up only while remembering is enabled. No unattended speech, guilt messages, streaks, or simulated emergencies.

## Next artistic work

Create additional authored expressions and prop poses using the same SVG rig, then evaluate them on the supported television runtime. If adopting Lottie, test assets for unsupported effects and performance on that runtime. Rive is not a submission dependency and is not included in the implementation.
