# Hearth competition preparation

## Positioning

**Hearth — Someone’s here.** A persistent, interactive television home that gives an older adult a little company and supports small connections with the people they care about. The interaction is designed around silence, remote control, memory, and a world that visibly changes with a relationship.

## Verified requirements

Reviewed the [Amazon Developer 2026 competition page](https://amazonappdev2026.devpost.com/) on October 14, 2026. The displayed deadline is October 23, 2026, at 3 PM EDT (19:00 UTC). Recheck the official rules before submitting.

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

- Hearth now installs, renders, animates, and responds to remote-selected replies on the official ARM Vega simulator. Record that runtime, not the browser preview; see `official-simulator.md` for evidence.
- Validate remote focus, select/back, display safe zones, WebView support, speech availability, and sustained animation performance on the target model.
- Record the already-tested Nova 2 Sonic voice and Nova 2 Lite dialogue on the target television. Use phone pairing if its remote does not expose raw microphone audio.
- Use the authored SVG/CSS animation pipeline; Rive is not required. Describe phone pairing and Sonic accurately; do not claim direct Alexa integration.
- With consent, document the builder-reported family trial: their grandmother reportedly used Hearth for three hours and laughed repeatedly; their father called it the coolest thing he had seen. These are informal anecdotes, not independently measured outcomes or clinical evidence.
- Prepare the repository, demo link, screenshots, product feedback, and release signing if distribution is required.

## Developer feedback log

Use the reproducible findings in `developer-feedback.md`. An Android recognizer intent and a Fire TV voice remote are different integration paths; direct Alexa integration is not implemented. Never invent hardware findings.

## Judging evidence and priorities

| Published criterion | Our strongest case | Evidence still needed before submission |
| --- | --- | --- |
| Tech Implementation | Official Vega wrapper, native remote bridge, phone pairing, streaming Sonic voice and action acknowledgments | Phone-to-Sonic playback and interruption on the actual simulator; restart continuity |
| Design | A TV-first living home, expressive Pip, readable captions, remote controls, cozy/cold environments | Complete remote-only walkthrough, recoverable failures, clear listening and stop states |
| Potential Impact | Older adults can enjoy playful company without learning a prompt interface; informal family trial | Consent-approved account of what people actually did, limitations, realistic operating cost |
| Quality of the Idea | Conversation changes what a character does and what a home remembers | One uninterrupted moment joining speech, action, expression, and remembered context |

The public page does not publish numerical weights for these four criteria. Do not manufacture a score or predict a win. Friction logs can earn up to a 10% bonus; useful, reproducible feedback is worth preparing.

## Track strategy

Primary entry: **Fire TV**. Recommended mini challenge: **AWS Builder**, using the documented Bedrock and Transcribe integrations already in the product. Verify and complete its extra submission fields. Each project can win only one track prize and one mini challenge prize.

Do not assume publishing Hearth alone qualifies for the Open Source mini challenge: the page asks for a new, additional licensed open-source project or a public-repository contribution alongside the primary submission, with contribution URL, repository URL, GitHub username, and an explanation. Avoid adding a separate project just to chase eligibility at the expense of finishing Hearth.

Repository access is a submission requirement: either public with an open-source license, or private with the required reviewers granted access. Choosing a license or changing repository visibility requires the owner's decision. For private access, follow the page's current reviewer list and timing instructions; invitations expire after seven days. Do not publish secrets or personal trial data.

## Submission copy draft

### Elevator pitch

Hearth turns the television into a little home shared with Pip: a playful AI companion who moves, listens, remembers with permission, and makes everyday moments more entertaining.

### Inspiration

Televisions already belong in the living room. We wanted to turn that familiar screen into something participatory: not another menu, chatbot, or clinical assistant, but a character you can laugh with. Early informal family use made the idea tangible: the builder's grandmother reportedly spent three hours with Pip. That is motivation to keep testing, not proof of a health benefit.

### What it does

Pip tends her home while the app is active. People can talk through a paired phone, use the television remote, ask her to dance, explore activities, and change the atmosphere from warm and cozy to cool and wintry. Live voice uses Amazon Nova Sonic. A separate hands-free path transcribes room speech with Amazon Transcribe and uses Jev through OpenRouter to decide which words appear directed to Pip. This classification is experimental; it is not a substitute for acoustic echo cancellation.

Local memories and world choices provide continuity. AI-proposed memories require confirmation. People can pause remembering, forget a memory, pause the microphone, or disconnect. Real-world connection prompts remain user-controlled: preparing a note is not sending a message or placing a call.

### How we built it

The home and character use authored SVG, CSS, and JavaScript rather than a proprietary animation editor. A React Native for Vega wrapper uses Amazon WebView and native TV key handling to run the experience on the official ARM Vega simulator. A Node backend supports streaming voice, phone pairing, and action routing. The phone supplies the microphone; this is not direct Alexa voice-remote integration. Amazon Bedrock provides Nova Sonic voice and configured Nova dialogue; Transcribe supports the optional ambient path. AWS EC2 supplies disposable simulator infrastructure, not an end-user hardware requirement.

### What makes it different

The conversation is only one part of the experience. Pip inhabits a home, moves independently during an active visit, performs actions, changes expression, and carries approved moments into later visits. Silence is allowed. The aim is enjoyable company that supports real relationships, not a simulated person who claims to replace them.

### Limitations and next steps

The current prototype needs the app open for independent behavior; it does not live continuously in the background. A paired phone must remain foregrounded for reliable microphone access. Memories are local to the TV browser profile, not a cloud account. Ambient attention classification can make mistakes. Physical Fire TV testing is not yet completed; official ARM simulator visual execution and remote selection are verified, while simulator voice acceptance checks remain open. Do not remove these distinctions until the corresponding checks pass.

## Submission gate

- [ ] Verify simulator phone pairing, Sonic playback, interruption, microphone pause, and disconnect.
- [ ] Save an approved memory, restart Hearth, and demonstrate accurate follow-up without a scripted time jump masquerading as live AI.
- [ ] Verify remote navigation, Back, error recovery, vibe switch, and at least one entertaining voice-triggered action.
- [ ] Capture official simulator footage and upload a public English video under three minutes; no recording is scheduled yet.
- [ ] Provide the repository and exact runnable revision, setup instructions, and a secret-free configuration example.
- [ ] Finalize feedback for every tool/API/SDK used, with AWS services described explicitly.
- [ ] Obtain permission for family quotations or omit identifiable details; label any synthetic participant speech.
- [ ] Recheck rules and extra fields before selecting a mini challenge; primary target is Fire TV.
- [ ] Verify termination and dedicated-host release; never extend simulator resources beyond the user's bounded lifetime without a new explicit instruction.
