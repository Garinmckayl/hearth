# Movie night — October 16 implementation

Open **Movie night with Pip** from the home or **Something together**. The movie shelf is the primary experience; **Connected TV app controls** opens optional native/Fire OS setup.

## Run

```sh
npm install
npm run fetch:films
npm run dev
```

Open `http://localhost:3000/?movies=1`. Film downloads are about 125 MB, hosted by Blender/W3C, and require no paid API. They are excluded from Git. `scripts/fetch-films.py` verifies their SHA-256 hashes. Big Buck Bunny is the complete 596-second film; Sintel is explicitly a one-minute trailer. Both credit Blender Foundation and CC BY 3.0 in the player. The Node server supports byte ranges for seeking and mobile playback. A static build can play films and rank the shelf locally; live recommendations require the backend.

## Implemented and exercised

- Live Bedrock recommendations select only IDs from the supplied film catalog. Preferences and completed-film history inform selection. Fallback shelf ranking is explicitly labeled when live AI is unavailable.
- The real HTML video player reports play, pause, seek, position, error, and end events. Pip appears beside the film, responds to intermissions, and discusses it through text or live voice. Her conversation uses supplied metadata and playback telemetry; there is no pixel analysis or claim to hear DRM media.
- Spoken `tv-pause`, `tv-play`, `tv-stop`, and `tv-status` requests operate the active Hearth Cinema player and return measured state to Nova Sonic. Film starts and external app launches require a viewer selection/confirmation. The paired phone also supplies explicit transport controls and can start an open film on the TV.
- Remembering taste is explicit. Playback position/completion storage is off until opted in, survives reload, and can be deleted. Data lives in `hearth.cinema.v1`, separately from the optional native/Fire OS profiles. Deleting this profile ends the active voice/pairing context.
- Movie-night pairing plays Pip's audio on the phone. The phone owns the microphone and voice stream, so TV backgrounding/disconnection does not close it. A three-hour maximum bounds the co-watch room; explicit end disconnects it sooner. The phone page must stay foregrounded. In-app film audio ducks while Pip speaks.
- An owner-authorized Fire OS bridge can be delegated to this private pairing without including the owner key in phone or AI context. Its fixed commands can continue from the phone after Hearth leaves the TV foreground. No attached Fire OS device was available to verify these actual external effects.

`scripts/capture-cinema-smoke.mjs` exercised real Bedrock inference and real Nova Sonic using synthetic microphone speech, with no mocked providers. It verified recommendation → actual film decoding → spoken movie pause → player acknowledgment → phone resume → fresh spoken audio from the same voice session after the TV background lifecycle → explicit disconnect. Artifacts: `artifacts/hearth-movie-night.{json,mp4,png}`. The recording is 53.72 seconds, 1920×1080, with live phone response audio. It is browser evidence, not official Vega or Prime playback evidence.

## Prime and external TV control

Prime suggestions are known films with **search links**, not claims of current account/region availability. Confirming a choice opens the fixed `https://www.primevideo.com/search?phrase=…` route. In a browser it opens separately; Vega checks an installed URL handler before requesting handoff; an unlocked Fire OS bridge targets only the owner's configured Prime package. Checked title-specific links can still be configured through the existing native/ADB catalog.

Native Vega Media Controls discovers actual providers, checks advertised capabilities, and samples provider state. A paired phone can request discovery while Hearth is active. **A Vega WebView cannot be assumed to execute native controls after its app is backgrounded.** Phone voice remains available; external controls in that situation require the delegated Fire OS bridge. The phone reports missing controls as unavailable.

No Prime account, entitlement, installed handler, actual Prime playback, or Prime pause/resume result has been verified. The bounded AWS M1 host is still pending; its automated acceptance now tests native open-film playback and spoken pause, plus actual media endpoint discovery. It does not label open-film footage as Prime.
