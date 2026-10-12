class HearthCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.samples = [];
    this.ratio = sampleRate / 16000;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let index = 0; index < input.length; index++) {
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        const sample = Math.max(-1, Math.min(1, input[index]));
        this.samples.push(Math.round(sample * (sample < 0 ? 32768 : 32767)));
      }
    }
    while (this.samples.length >= 320) {
      const chunk = this.samples.splice(0, 320);
      const bytes = new ArrayBuffer(640);
      const view = new DataView(bytes);
      chunk.forEach((sample, index) => view.setInt16(index * 2, sample, true));
      this.port.postMessage(bytes, [bytes]);
    }
    return true;
  }
}
registerProcessor('hearth-capture', HearthCapture);
