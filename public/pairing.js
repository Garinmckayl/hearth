import { RealtimeVoice } from './voice.js';

export class PhonePairing {
  constructor({ backend = '', status, text, speaking, ended, action, activity, energy }) {
    Object.assign(this, { backend, status, text, speaking, ended, action, activity, energy });
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
        if (data.type === 'context') { this.context = data.context; this.status('Connected to your television. Choose Start microphone.'); }
        if (data.type === 'phone-connected') this.status('Phone connected. Start its microphone when you’re ready.');
        if (data.type === 'phone-left') { this.voice?.clearAudio(); this.status('Phone disconnected. Scan again to reconnect.'); }
        if (data.type === 'status') this.status(data.text);
        if (data.type === 'voice-event') this.voice?.event(data.event);
        if (data.type === 'action-result') this.voice?.actionResult(data.result);
        if (data.type === 'user-text') this.voice?.submitText(data.text);
      } catch { this.status('The phone connection could not read a response.'); this.stop(); }
    };
    this.socket.onerror = () => this.status('Pairing could not connect. Create a fresh link on the television.');
    this.socket.onclose = () => { this.stop(); this.ended(); };
  }
  async host(context) {
    this.voice = new RealtimeVoice({ mode: context.mode || 'conversation', onStatus: this.status, onText: this.text, onSpeaking: this.speaking, onAction: this.action, onActivity: this.activity, onEnergy: this.energy, onActionResult: result => this.send({ type: 'action-result', result }) });
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
    this.voice = new RealtimeVoice({ endpoint: target.href, voice: this.context.voice, context: this.context, mode: this.context.mode || 'conversation', playback: false, handleActions: false,
      onText: this.text, onStatus: message => { this.status(message); this.send({ type: 'status', text: message }); if (message.startsWith('Voice ended')) this.voice?.onError(message); },
      onError: message => { this.status(message); this.voice?.stop(); this.microphoneEnded?.(); },
      onEvent: event => { if (Object.keys(event).length === 1 && ['ready', 'contentStart', 'textOutput', 'audioOutput', 'contentEnd', 'hearthAction', 'attention', 'acceptedUtterance'].includes(Object.keys(event)[0])) this.send({ type: 'voice-event', event }); }
    });
    try { await this.voice.start(); } catch (error) { this.voice.stop(); throw error; }
  }
  send(message) {
    if (this.socket?.readyState === 1 && this.socket.bufferedAmount < 1000000) this.socket.send(JSON.stringify(message));
  }
  userText(text) { if (this.closed || this.socket?.readyState !== 1) return false; this.send({ type: 'user-text', text }); return true; }
  stop() {
    this.closed = true;
    this.voice?.stop();
    if (this.socket && this.socket.readyState < 2) this.socket.close();
  }
}
