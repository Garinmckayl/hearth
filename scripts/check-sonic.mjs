import { SonicSession } from '../lib/sonic.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

const chunks = [];
let finalText = '';
let receivedAudio = false;
const session = new SonicSession({ voice: 'tiffany', onEvent: event => {
  if (event.ready) console.log('Nova Sonic bidirectional stream connected.');
  if (event.contentStart) console.log(`Nova Sonic content: ${event.contentStart.role} ${event.contentStart.type}`);
  if (event.audioOutput) { receivedAudio = true; chunks.push(Buffer.from(event.audioOutput.content, 'base64')); }
  if (event.textOutput) finalText += event.textOutput.content;
  if (event.contentEnd?.type === 'AUDIO' && receivedAudio) session.stop();
  if (event.completionEnd && receivedAudio) session.stop();
} });
const timer = setTimeout(() => session.stop(), 30000);
const silence = setInterval(() => session.audio(Buffer.alloc(640)), 20);
try {
  await session.run({ audio: true, initialText: 'Please say only: Hello, I’m Pip. It’s good to have you here. There’s no rush. Come sit with me by the fire.' });
} catch (error) {
  if (!receivedAudio && error.name !== 'AbortError') { console.error(`Nova Sonic check failed: ${error.name}: ${error.message}`); process.exitCode = 1; }
} finally { clearTimeout(timer); clearInterval(silence); session.stop(); }
if (receivedAudio) {
  const pcm = Buffer.concat(chunks);
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/pip-nova-sonic.wav', Buffer.concat([header, pcm]));
  console.log(`Nova Sonic live check passed: ${pcm.length} audio bytes, ${finalText.length} transcript characters. Tiffany sample saved to artifacts/pip-nova-sonic.wav`);
} else { console.error('Nova Sonic did not produce audio.'); process.exitCode = 1; }
