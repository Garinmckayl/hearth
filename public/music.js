export class FiresideTune {
  async play() {
    this.stop();
    const audio = new (window.AudioContext || window.webkitAudioContext)(); this.audio = audio;
    await audio.resume();
    if (this.audio !== audio) return;
    const melody = [60, 64, 67, 64, 62, 65, 69, 65, 64, 67, 72, 67, 62, 65, 67, 60];
    const gain = audio.createGain(); gain.gain.value = 0.12; gain.connect(audio.destination);
    for (const [index, note] of melody.entries()) {
      const start = audio.currentTime + 0.05 + index * 0.65;
      for (const interval of [0, -12]) {
        const oscillator = audio.createOscillator(); const envelope = audio.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = 440 * 2 ** ((note + interval - 69) / 12);
        envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(interval ? 0.25 : 0.65, start + 0.025); envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
        oscillator.connect(envelope); envelope.connect(gain); oscillator.start(start); oscillator.stop(start + 0.6);
      }
    }
    this.timer = setTimeout(() => this.stop(), 11500);
  }
  stop() { clearTimeout(this.timer); this.audio?.close().catch(() => {}); this.audio = null; }
}
