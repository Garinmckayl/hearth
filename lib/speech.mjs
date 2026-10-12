import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { VOICES } from './sonic.mjs';

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

export async function synthesizeSpeech(text, voice = 'tiffany', provider) {
  if (typeof text !== 'string' || !text.trim() || text.length > 800 || !VOICES.includes(voice)) throw new Error('Invalid speech request.');
  const key = `${voice}:${text}`;
  if (!provider && cache.has(key)) return cache.get(key);
  if (active >= 2) throw new Error('Speech is busy.');
  active++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  if (!provider && !client) client = new PollyClient({ region: process.env.POLLY_REGION || process.env.AWS_REGION || 'us-east-1', maxAttempts: 1 });
  let wav;
  try {
    const response = await (provider || client).send(new SynthesizeSpeechCommand({ Text: text, TextType: 'text', VoiceId: { tiffany: 'Tiffany', amy: 'Amy', olivia: 'Olivia' }[voice], Engine: 'generative', OutputFormat: 'pcm', SampleRate: '16000' }), { abortSignal: controller.signal });
    if (!response.AudioStream) throw new Error('Speech is unavailable.');
    const bytes = await response.AudioStream.transformToByteArray();
    if (!bytes.length || bytes.length > 2000000 || controller.signal.aborted) throw new Error('Speech did not finish.');
    wav = encodeWav(Buffer.from(bytes), 16000);
  } finally { clearTimeout(timer); active--; }
  if (!provider) { if (cache.size >= 32) cache.delete(cache.keys().next().value); cache.set(key, wav); }
  return wav;
}
