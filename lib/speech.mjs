import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { SonicSession, VOICES } from './sonic.mjs';

export function encodeWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const cache = new Map();
let active = 0;
let client;

export function cacheSpeech(text, wav, voice = 'tiffany') {
  if (typeof text !== 'string' || !text.trim() || !Buffer.isBuffer(wav)) return;
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(`${voice}:${text.trim()}`, wav);
}

async function synthesizeWithSonic(text, voice = 'tiffany', signal) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let timer;
    let doneTimer;
    let settled = false;
    const finish = (err, wav) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(doneTimer);
      try { session.stop(); } catch {}
      if (err) reject(err);
      else resolve(wav);
    };
    if (signal?.aborted) { reject(new Error('Aborted')); return; }
    signal?.addEventListener('abort', () => finish(new Error('Aborted')), { once: true });
    const session = new SonicSession({
      voice,
      onEvent: event => {
        if (event.ready) {
          session.text(`Please speak this exact line warmly as Pip, without adding any extra words before or after: "${text}"`);
        }
        if (event.contentStart?.role === 'ASSISTANT') {
          clearTimeout(doneTimer);
        }
        if (event.audioOutput) {
          clearTimeout(doneTimer);
          chunks.push(Buffer.from(event.audioOutput.content, 'base64'));
        }
        if (event.contentEnd?.type === 'AUDIO' && chunks.length > 0) {
          clearTimeout(doneTimer);
          doneTimer = setTimeout(() => finish(null, encodeWav(Buffer.concat(chunks), 24000)), 400);
        }
      }
    });
    const silence = Buffer.alloc(3200);
    timer = setInterval(() => { try { session.audio(silence); } catch {} }, 100);
    session.run({ audio: true }).catch(err => {
      if (chunks.length > 0) finish(null, encodeWav(Buffer.concat(chunks), 24000));
      else finish(err);
    });
  });
}

export async function synthesizeSpeech(text, voice = 'tiffany', provider) {
  if (typeof text !== 'string' || !text.trim() || text.length > 800 || !VOICES.includes(voice)) throw new Error('Invalid speech request.');
  const key = `${voice}:${text.trim()}`;
  if (!provider && cache.has(key)) return cache.get(key);
  if (active >= 2) throw new Error('Speech is busy.');
  active++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let wav;
  try {
    if (!provider) {
      wav = await synthesizeWithSonic(text.trim(), voice, controller.signal);
    } else {
      const response = await provider.send(new SynthesizeSpeechCommand({ Text: text, TextType: 'text', VoiceId: { tiffany: 'Tiffany', amy: 'Amy', olivia: 'Olivia' }[voice], Engine: 'generative', OutputFormat: 'pcm', SampleRate: '16000' }), { abortSignal: controller.signal });
      if (!response.AudioStream) throw new Error('Speech is unavailable.');
      const bytes = await response.AudioStream.transformToByteArray();
      if (!bytes.length || bytes.length > 2000000 || controller.signal.aborted) throw new Error('Speech did not finish.');
      wav = encodeWav(Buffer.from(bytes), 16000);
    }
  } finally { clearTimeout(timer); active--; }
  if (!provider) cacheSpeech(text, wav, voice);
  return wav;
}
