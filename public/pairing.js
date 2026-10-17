import { RealtimeVoice } from './voice.js';
import { filmById } from './film-catalog.js';

export class PhonePairing {
  constructor({ backend = '', status, text, speaking, ended, action, activity, energy, control }) {
    Object.assign(this, { backend, status, text, speaking, ended, action, activity, energy, control });
    this.pendingControls = new Map(); this.hostActive = true; this.controlSequence = 0;
  }
  connect(room, host) {
    const target = new URL(`${this.backend}/api/room-stream`, location.href);
    target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
    target.searchParams.set('room', room);
    if (host) target.searchParams.set('host', host);
    this.socket = new WebSocket(target);
    this.socket.onmessage = async message => {
      try {
        const data = JSON.parse(message.data);
        if (data.type === 'context') { this.context = data.context; this.coWatch = data.context.cowatch === true; this.hostActive = data.hostActive !== false; this.onContext?.(this.context); this.status('Connected to your television. Choose Start microphone.'); }
        if (data.type === 'host-state') { this.hostActive = data.active; this.onHostState?.(data.active); this.status(data.active ? 'Your TV is back with Pip.' : 'Pip stays with you on this phone. TV app controls may be unavailable.'); }
        if (data.type === 'playback') { this.latestPlayback = data.playback; if (this.context?.viewer) this.context.viewer.playback = data.playback; if (this.voice?.context?.viewer) this.voice.context.viewer.playback = data.playback; this.onPlayback?.(data.playback); }
        if (data.type === 'control-request' && this.isHost) { const result = await this.control(data.command); this.send({type:'control-result',id:data.id,result}); }
        if (data.type === 'control-result') { const pending = this.pendingControls.get(data.id); if (pending) { clearTimeout(pending.timer); this.pendingControls.delete(data.id); pending.resolve(data.result); } }
        if (data.type === 'phone-connected') this.status('Phone connected. Start its microphone when you’re ready.');
        if (data.type === 'phone-left') { this.voice?.clearAudio(); this.status('Phone disconnected. Scan again to reconnect.'); }
        if (data.type === 'speaking') this.speaking?.(data.active);
        if (data.type === 'status') this.status(data.text);
        if (data.type === 'voice-event' && !(this.coWatch && data.event.audioOutput)) this.voice?.event(data.event);
        if (data.type === 'action-result') this.voice?.actionResult(data.result);
        if (data.type === 'user-text') this.voice?.submitText(data.text);
      } catch { this.status('The phone connection could not read a response.'); this.stop(); }
    };
    this.socket.onerror = () => this.status('Pairing could not connect. Create a fresh link on the television.');
    this.socket.onclose = () => { this.stop(); this.ended(); };
  }
  async host(context) {
    this.isHost = true; this.coWatch = context.cowatch === true;
    this.voice = new RealtimeVoice({ mode: context.mode || 'conversation', playback:!this.coWatch, onStatus: this.status, onText: this.text, onSpeaking: this.speaking, onAction: this.action, onActivity: this.activity, onEnergy: this.energy, onActionResult: result => this.send({ type: 'action-result', result }) });
    this.voice.audio = new (window.AudioContext || window.webkitAudioContext)();
    await this.voice.audio.resume();
    const response = await fetch(`${this.backend}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context }) });
    if (!response.ok) throw new Error('Pairing is unavailable. Please try again.');
    const room = await response.json();
    if (this.closed) return;
    this.connect(room.token, room.hostToken);
    return { ...room, qr: `${this.backend}/api/rooms/${room.token}/qr` };
  }
  async microphone() {
    if (this.closed) throw new Error('This pairing has ended. Create a new link on the television.');
    if (!this.context || this.socket?.readyState !== 1) throw new Error('Wait for the television connection first.');
    this.voice?.stop();
    const target = new URL(`${this.backend}/api/voice`, location.href);
    target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
    this.voice = new RealtimeVoice({ endpoint: target.href, voice: this.context.voice, context: this.context, mode: this.context.mode || 'conversation', playback: this.coWatch, handleActions: false,
      onSpeaking: active => {if (this.coWatch && this.lastSpeaking !== active) {this.lastSpeaking=active;this.send({type:'speaking',active});}},
      onText: this.text, onStatus: message => { this.status(message); this.send({ type: 'status', text: message }); if (message.startsWith('Voice ended')) this.voice?.onError(message); },
      onError: message => { this.status(message); this.voice?.stop(); this.microphoneEnded?.(); },
      onEvent: event => {
        if (event.hearthAction && this.coWatch && !this.hostActive) { this.backgroundAction(event.hearthAction); return; }
        if (Object.keys(event).length === 1 && ['ready', 'contentStart', 'textOutput', 'audioOutput', 'contentEnd', 'hearthAction', 'attention', 'acceptedUtterance'].includes(Object.keys(event)[0])) this.send({ type: 'voice-event', event });
      }
    });
    try { await this.voice.start(); } catch (error) { this.voice.stop(); throw error; }
  }
  send(message) {
    if (this.socket?.readyState === 1 && this.socket.bufferedAmount < 1000000) this.socket.send(JSON.stringify(message));
  }
  userText(text) { if (this.closed || this.socket?.readyState !== 1) return false; this.send({ type: 'user-text', text }); return true; }
  playback(playback) { if (this.isHost && this.coWatch) this.send({type:'playback',playback}); }
  suspend() { if (this.isHost && this.coWatch) this.send({type:'host-state',active:false}); }
  resume() { if (this.isHost && this.coWatch) this.send({type:'host-state',active:true}); }
  requestControl(command) {
    if (this.closed || this.socket?.readyState !== 1 || this.isHost) return Promise.resolve({ok:false,summary:'The TV companion connection is unavailable.'});
    if (this.pendingControls.size >= 4) return Promise.resolve({ok:false,summary:'Wait for the current TV command.'});
    const id = String(++this.controlSequence);
    return new Promise(resolve => { const timer = setTimeout(()=>{this.pendingControls.delete(id);resolve({ok:false,summary:'The TV did not respond. Playback state is unknown.'});},8000); this.pendingControls.set(id,{resolve,timer}); this.send({type:'tv-command',id,command}); });
  }
  async backgroundAction(action) {
    let result = {ok:false,summary:'The TV app is in the background. World gestures are unavailable; keep talking here on the phone.'};
    const command = {action:action.action.replace(/^tv-/,''), ...(action.text ? {text:action.text} : {})};
    if (action.action === 'tv-title') {
      const film=filmById(action.text);
      if (film?.kind === 'search') {command.action='prime-search';command.text=film.title;}
      else if (/^[A-Z0-9]{10}$/.test(action.text || '')) {command.action='title';command.id=action.text;delete command.text;}
    }
    if (action.action === 'tv-status') result = await this.requestControl({action:'status'});
    else if (['tv-pause','tv-play','tv-stop','tv-return','tv-back','tv-prime'].includes(action.action) || action.action === 'tv-title' && (command.action === 'prime-search' || command.action === 'title' && command.id)) {
      const root = document.getElementById('phone-control-result');
      if (root) {
        root.replaceChildren(); const label = document.createElement('p'); label.textContent = `Pip requests ${command.action} on your TV.`;
        const confirm = document.createElement('button'); confirm.className='primary-button'; confirm.textContent='Confirm TV action';
        const cancel = document.createElement('button'); cancel.className='subtle-button'; cancel.textContent='Cancel'; cancel.onclick=()=>root.replaceChildren();
        confirm.onclick=async()=>{confirm.disabled=true;const reply=await this.requestControl(command);root.textContent=reply.summary;this.voice?.submitText(`Confirmed TV action result: ${reply.summary}`);};
        root.append(label,confirm,cancel); result={ok:true,summary:'A phone confirmation is displayed. No TV command has run. Wait for the viewer to confirm and the subsequent result.'};
      }
    }
    this.voice?.actionResult({toolUseId:action.toolUseId,...result});
  }
  stop() {
    if (this.coWatch && !this.closed) this.send({type:'stop'});
    this.closed = true;
    for (const pending of this.pendingControls.values()) {clearTimeout(pending.timer);pending.resolve({ok:false,summary:'The connection ended.'});} this.pendingControls.clear();
    this.voice?.stop();
    if (this.socket && this.socket.readyState < 2) this.socket.close();
  }
}
