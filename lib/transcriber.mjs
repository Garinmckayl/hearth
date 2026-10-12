import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from '@aws-sdk/client-transcribe-streaming';

export class AmbientTranscriber {
  constructor({ onUtterance, client }) {
    this.onUtterance = onUtterance;
    this.client = client || new TranscribeStreamingClient({ region: process.env.AWS_REGION || 'us-east-1', maxAttempts: 1 });
    this.ownsClient = !client;
    this.controller = new AbortController(); this.queue = []; this.pending = []; this.seen = new Set();
    this.turnParts = []; this.turnTimer = null;
  }
  audio(bytes) {
    if (this.controller.signal.aborted) return;
    if (!bytes.length || bytes.length > 16000 || bytes.length % 2 || this.queue.length > 50) throw new Error('Invalid or backlogged audio');
    this.pending.push(Buffer.from(bytes));
    if (this.pending.reduce((size, chunk) => size + chunk.length, 0) >= 3200) {
      this.queue.push(Buffer.concat(this.pending)); this.pending = []; this.waiter?.(); this.waiter = null;
    }
  }
  async *stream() {
    while (!this.controller.signal.aborted) {
      if (this.queue.length) yield { AudioEvent: { AudioChunk: this.queue.shift() } };
      else await new Promise(resolve => { this.waiter = resolve; });
    }
  }
  async run() {
    try {
      const response = await this.client.send(new StartStreamTranscriptionCommand({ LanguageCode: 'en-US', MediaEncoding: 'pcm', MediaSampleRateHertz: 16000, EnablePartialResultsStabilization: true, PartialResultsStability: 'medium', AudioStream: this.stream() }), { abortSignal: this.controller.signal });
      for await (const event of response.TranscriptResultStream || []) {
        if (!event.TranscriptEvent) throw new Error('Transcription stream failed.');
        for (const result of event.TranscriptEvent.Transcript?.Results || []) {
          if (this.paused) continue;
          const text = result.Alternatives?.[0]?.Transcript?.trim();
          if (text) clearTimeout(this.turnTimer);
          if (!result.IsPartial && text && !this.seen.has(result.ResultId)) {
            this.seen.add(result.ResultId);
            if (this.seen.size > 300) this.seen.delete(this.seen.values().next().value);
            this.turnParts = [[...this.turnParts, text].join(' ').slice(0, 1000)];
          }
          if (text && this.turnParts.length) this.turnTimer = setTimeout(() => this.flushTurn(), 1500);
        }
      }
    } finally { clearTimeout(this.turnTimer); if (this.ownsClient) this.client.destroy(); }
  }
  flushTurn() {
    clearTimeout(this.turnTimer);
    if (this.controller.signal.aborted || !this.turnParts.length) return;
    const text = this.turnParts.join(' ').slice(0, 1000); this.turnParts = [];
    this.onUtterance(text);
  }
  setPaused(paused) { this.paused = paused; clearTimeout(this.turnTimer); this.turnParts = []; }
  stop() { clearTimeout(this.turnTimer); this.turnParts = []; this.controller.abort(); this.queue = []; this.pending = []; this.waiter?.(); this.waiter = null; if (this.ownsClient) this.client.destroy(); }
}
