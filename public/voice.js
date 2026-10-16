export class RealtimeVoice {
  constructor({ endpoint, voice = 'tiffany', context = {}, mode = 'conversation', onStatus = () => {}, onText = () => {}, onSpeaking = () => {}, onError = () => {}, onEvent = () => {}, onAction = () => ({ ok: false }), onActionResult, handleActions = true, onActivity = () => {}, onEnergy = () => {}, playback = true }) {
    this.endpoint = endpoint; this.voice = voice; this.context = context;
    this.onStatus = onStatus; this.onText = onText; this.onSpeaking = onSpeaking; this.onError = onError;
    this.onEvent = onEvent; this.playback = playback;
    Object.assign(this, { mode, onAction, onActionResult, handleActions, onActivity, onEnergy });
    this.blocks = new Map(); this.sources = new Set(); this.nextPlay = 0; this.closed = false; this.muted = false;
  }
  async start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error('This device does not support live microphone audio.');
    this.onStatus('Connecting your cozy voice…');
    this.audio = new (window.AudioContext || window.webkitAudioContext)();
    await this.audio.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (this.closed) { this.stream.getTracks().forEach(track => track.stop()); return; }
    await this.audio.audioWorklet.addModule('pcm-capture.js');
    if (this.closed) return;
    this.input = this.audio.createMediaStreamSource(this.stream);
    this.capture = new AudioWorkletNode(this.audio, 'hearth-capture');
    const silent = this.audio.createGain(); silent.gain.value = 0;
    this.input.connect(this.capture); this.capture.connect(silent); silent.connect(this.audio.destination);
    this.connectSocket();
    this.capture.port.onmessage = event => {
      if (this.socket.readyState === WebSocket.OPEN && this.ready) {
        if (this.socket.bufferedAmount > 64000) { this.onError('Your connection is too slow for live voice.'); this.stop(); return; }
        this.socket.send(this.muted ? new ArrayBuffer(event.data.byteLength) : event.data);
      }
    };
  }
  connectSocket() {
    if (this.closed) return;
    this.ready = false; this.blocks.clear();
    const socket = new WebSocket(this.endpoint); this.socket = socket;
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      this.socket.send(JSON.stringify({ type: 'start', voice: this.voice, context: this.context, mode: this.mode }));
      if (this.mode === 'ambient' && this.muted) this.socket.send(JSON.stringify({ type: 'pause', paused: true }));
    };
    socket.onmessage = message => {
      try { this.event(JSON.parse(message.data)); } catch { this.onError('Voice received an unreadable response.'); this.stop(); }
    };
    socket.onerror = () => {};
    socket.onclose = event => {
      if (this.closed || socket !== this.socket) return;
      this.ready = false;
      if ([1012, 1006].includes(event.code) && (this.reconnectAttempts || 0) < 3) {
        this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
        this.onStatus('Keeping your connection with Pip alive…');
        this.reconnectTimer = setTimeout(() => this.connectSocket(), 1000 * this.reconnectAttempts);
      } else { this.onStatus('Voice ended. Keep your phone screen open and start again when ready.'); this.stop(); }
    };
  }
  rememberTurn(role, text) {
    if (!['USER', 'ASSISTANT'].includes(role)) return;
    this.context = { ...this.context, recentConversation: [...(this.context.recentConversation || []), { role: role.toLowerCase(), text: text.slice(0, 1000) }].slice(-8) };
  }
  submitText(text) {
    if (this.closed || !this.ready || this.socket?.readyState !== 1 || typeof text !== 'string' || !text.trim() || text.length > 500) return false;
    this.socket.send(JSON.stringify({ type: 'text', text }));
    return true;
  }
  event(event) {
    if (this.closed) return;
    this.onEvent(event);
    if (event.attention) {
      const decision = event.attention;
      this.onStatus(decision.state === 'considering' ? 'Checking whether those words are for Pip…' : decision.accepted ? 'That’s for Pip. She’s listening.' : decision.reason === 'unavailable' ? 'Attention check unavailable. Pip stays quiet.' : decision.reason === 'limit' ? 'A lot of words at once. Give me a little moment.' : decision.reason === 'uncertain' ? 'Not sure those words were for me. Try “Pip, can you hear me?” or choose Just us mode.' : 'Giving your room conversation some space.');
    }
    if (event.acceptedUtterance) { this.rememberTurn('USER', event.acceptedUtterance.text); this.clearAudio(); this.onActivity('listening'); this.onText('USER', event.acceptedUtterance.text, true); }
    if (event.hearthAction && this.handleActions) {
      const action = event.hearthAction;
      Promise.resolve().then(() => this.closed ? { ok: false } : this.onAction(action)).then(result => this.actionResult({ toolUseId: action.toolUseId, ok: result?.ok === true, ...(typeof result?.summary === 'string' ? { summary: result.summary.slice(0, 1000) } : {}) })).catch(() => this.actionResult({ toolUseId: action.toolUseId, ok: false }));
    }
    if (event.error) { this.onError(event.error); this.stop(); return; }
    if (event.ready) { this.ready = true; this.reconnectAttempts = 0; this.onStatus(this.muted ? 'Microphone paused.' : this.mode === 'ambient' ? 'Hands-free is on. No repeated wake word.' : 'Listening. Take your time.'); this.onActivity(this.muted ? 'paused' : 'ready'); }
    if (event.contentStart) {
      const block = event.contentStart;
      let stage;
      try { stage = JSON.parse(block.additionalModelFields || '{}').generationStage; } catch {}
      this.blocks.set(block.contentName || block.contentId, { role: block.role, stage, text: '' });
      if (block.role === 'USER' && this.mode !== 'ambient') { this.clearAudio(); this.onStatus('Listening to you…'); this.onActivity('listening'); }
      if (block.role === 'ASSISTANT' && !this.sources.size) this.onActivity('thinking');
    }
    if (event.textOutput) {
      const block = this.blocks.get(event.textOutput.contentName || event.textOutput.contentId);
      if (event.textOutput.content.includes('"interrupted"')) { this.clearAudio(); this.onStatus('Listening to you…'); this.onActivity('listening'); return; }
      if (block) {
        block.text += event.textOutput.content;
        if (!(this.mode === 'ambient' && block.role === 'USER') && (block.role === 'USER' || block.stage !== 'SPECULATIVE')) this.onText(block.role, block.text, false);
      }
    }
    if (event.audioOutput && this.playback) this.play(event.audioOutput.content);
    if (event.contentEnd) {
      const block = this.blocks.get(event.contentEnd.contentName || event.contentEnd.contentId);
      if (block?.text && !(this.mode === 'ambient' && block.role === 'USER') && (block.role === 'USER' || block.stage !== 'SPECULATIVE')) { this.rememberTurn(block.role, block.text); this.onText(block.role, block.text, true); }
      this.blocks.delete(event.contentEnd.contentName || event.contentEnd.contentId);
      if (event.contentEnd.stopReason === 'INTERRUPTED') this.clearAudio();
    }
  }
  play(base64) {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const samples = new Float32Array(Math.floor(bytes.length / 2));
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
    const buffer = this.audio.createBuffer(1, samples.length, 24000); buffer.copyToChannel(samples, 0);
    if (this.nextPlay > this.audio.currentTime + 15) this.clearAudio();
    if (!this.analyser) { this.analyser = this.audio.createAnalyser(); this.analyser.fftSize = 256; this.analyser.connect(this.audio.destination); this.levels = new Uint8Array(256); }
    const source = this.audio.createBufferSource(); source.buffer = buffer; source.connect(this.analyser);
    const when = Math.max(this.nextPlay, this.audio.currentTime + 0.03);
    source.start(when); this.nextPlay = when + buffer.duration; this.sources.add(source);
    this.onSpeaking(true); this.onActivity('speaking'); this.onStatus('Pip is speaking. You can interrupt.');
    if (!this.energyFrame) this.measureEnergy();
    source.onended = () => { this.sources.delete(source); source.disconnect(); if (!this.sources.size) { this.onSpeaking(false); this.onActivity(this.muted ? 'paused' : 'ready'); this.onStatus(this.muted ? 'Microphone paused.' : 'Listening. Take your time.'); } };
  }
  measureEnergy() {
    if (!this.sources.size || this.closed) { this.energyFrame = null; this.onEnergy(0); return; }
    this.analyser.getByteTimeDomainData(this.levels);
    let total = 0;
    for (const sample of this.levels) total += ((sample - 128) / 128) ** 2;
    this.onEnergy(Math.min(1, Math.sqrt(total / this.levels.length) * 5));
    this.energyFrame = requestAnimationFrame(() => this.measureEnergy());
  }
  actionResult(result) {
    if (this.closed) return;
    if (this.onActionResult) this.onActionResult(result);
    else if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: 'action-result', ...result }));
  }
  clearAudio() {
    for (const source of this.sources) { source.onended = null; try { source.stop(); source.disconnect(); } catch {} }
    this.sources.clear(); this.nextPlay = 0; this.onSpeaking(false);
    if (this.energyFrame) cancelAnimationFrame(this.energyFrame); this.energyFrame = null; this.onEnergy(0);
  }
  mute() {
    this.muted = !this.muted;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !this.muted; });
    if (this.mode === 'ambient' && this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: 'pause', paused: this.muted }));
    if (this.muted) this.clearAudio();
    this.onStatus(this.muted ? 'Microphone paused.' : 'Listening. Take your time.');
    this.onActivity(this.muted ? 'paused' : 'ready');
    return this.muted;
  }
  stop() {
    clearTimeout(this.reconnectTimer);
    this.closed = true; this.ready = false;
    this.clearAudio(); this.stream?.getTracks().forEach(track => track.stop());
    this.input?.disconnect(); this.capture?.disconnect();
    this.audio?.close().catch(() => {});
    if (this.socket && this.socket.readyState < 2) this.socket.close(1000, 'Conversation ended');
  }
}
