# Developer feedback draft

These are implementation observations, not claims about all supported devices. Confirm them against the submitted revision. Never include pairing tokens, emulator authentication tokens, AWS credentials, or private user speech in logs.

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

Before submission, add concise first-hand feedback for React Native for Vega, SVG/CSS authoring, Node/WebSocket pairing, Cloudflare preview hosting, AWS EC2/SSM simulator access, and each remaining development tool actually included in the submitted workflow. Cover purpose, what worked, what needs work, onboarding, and whether we would use it again. This draft is not yet the complete required feedback answer.
