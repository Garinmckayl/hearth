---
workflow: general-video
mode: autonomous
message: "Hearth turns your Fire TV into a warm living room with Pip, an AI companion powered by Amazon Nova 2 Sonic who remembers your life and past shows, chooses tonight's movie with you, pushes picks to your phone, dances by the fire, and watches alongside you."
aspect: 1920x1080
---

## Frame 1 — Cozy Company & Living Room Presence (0:00–0:22)
- status: outline
- duration: 22s
- beat: Contrast cold streaming tile grids with Hearth's warm 10-foot living room on Fire TV where Pip keeps you company by the fire, breathes, waters the fern, and shifts the home between Cold and Cozy moods.

## Frame 2 — Strong Persistent Memory & Past Shows (0:22–0:46)
- status: outline
- duration: 24s
- beat: Show Pip's persistent memory across days — remembering your granddaughter's recital (with the drawing on the wall) and your past watched shows (Sintel completed, Tears of Steel at 6:20), talking with you about what you loved before.

## Frame 3 — Choosing Tonight's Movie & Sending Pick to Phone (0:46–1:12)
- status: outline
- duration: 26s
- beat: Ask Pip for "Something funny and short, with woodland animals." Pip speaks her recommendation aloud in real 24 kHz Amazon Nova 2 Sonic voice, narrows the TV shelf to Big Buck Bunny & Paddington, and pushes the "Pip's Pick Sent to Your Phone" card directly to the paired phone.

## Frame 4 — Phone ↔ TV Bidirectional Voice & Fireside Dance (1:12–1:38)
- status: outline
- duration: 26s
- beat: Show QR phone pairing creating a live WebSocket room bridge. Speak into the phone to ask Pip to dance; Nova 2 Sonic invokes `perform_world_action(action="dance")`, the TV executes the fireside shuffle and returns `[TV acknowledgment]` before Pip finishes speaking.

## Frame 5 — Watching Together, Spoken Pause/Resume & Co-Watch Survival (1:38–2:12)
- status: outline
- duration: 34s
- beat: Watch Big Buck Bunny together in Hearth Cinema with Pip beside the screen. Speak into the paired phone to pause the film (`tv-pause`), verify TV `PAUSED` telemetry on the phone, resume playback, and show co-watch voice surviving on the phone when the TV switches apps.

## Frame 6 — Official ARM64 Vega OS Simulator (2:12–2:34)
- status: outline
- duration: 22s
- beat: Showcase `hearth-vega-aarch64.vpkg` running inside Amazon's official ARM64 Vega Virtual Device (SDK 0.24.12112) at 1920x1080 with native D-pad focus, `kpenter` remote control, and Kepler Media Controls / WebView integration.

## Frame 7 — Dual-Surface AWS Architecture (2:34–2:48)
- status: outline
- duration: 14s
- beat: Animated architecture diagram detailing Fire TV / Vega OS WebView + Paired Phone 16 kHz WebAudio PCM + Node.js Room Broker + Amazon Bedrock Nova 2 Sonic bidirectional streaming + Nova 2 Lite + Amazon Transcribe + Jev attention gate.

## Frame 8 — Finale & Call to Action (2:48–3:00)
- status: outline
- duration: 12s
- beat: Closing lockup: "Hearth: Movie Night with Pip — Your TV Has Someone In It" with Pip waving by the fire.
