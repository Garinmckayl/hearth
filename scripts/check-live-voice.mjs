import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';

const origin = process.env.HEARTH_TEST_ORIGIN || 'http://127.0.0.1:3000';
const endpoint = origin.replace(/^http/, 'ws') + '/api/voice';
const input = await readFile(process.env.HEARTH_TEST_PCM || '/tmp/hearth-test-voice.pcm');
let performedAction = false;
const socket = new WebSocket(endpoint, { headers: { Origin: origin } });
let sent = 0;
let interval;
let audioBytes = 0;
let userText = false;
let assistantText = false;
const blocks = new Map();
const timeout = setTimeout(() => { console.error(`Live voice check timed out: user captions=${userText}, assistant captions=${assistantText}, audio bytes=${audioBytes}, expected action=${performedAction}.`); process.exitCode = 1; socket.close(); }, 45000);
socket.on('open', () => socket.send(JSON.stringify({ type: 'start', voice: 'tiffany', mode: process.env.HEARTH_TEST_MODE || 'conversation', context: { name: 'Demo visitor', memories: [] } })));
socket.on('message', data => {
  const event = JSON.parse(data.toString());
  if (event.attention && event.attention.reason) console.log(`Jev attention: ${event.attention.reason}, ${event.attention.latencyMs ?? '-'} ms`);
  if (event.acceptedUtterance) userText = true;
  if (process.env.HEARTH_TEST_DEBUG === 'true' && (event.textOutput || event.toolUse || event.ready)) console.log(JSON.stringify(event));
  if (event.error) { console.error(event.error); process.exitCode = 1; socket.close(); }
  if (event.ready) {
    interval = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const chunk = input.subarray(sent, sent + 640);
      sent += 640;
      socket.send(chunk.length === 640 ? chunk : Buffer.alloc(640));
    }, 20);
  }
  if (event.contentStart) blocks.set(event.contentStart.contentName || event.contentStart.contentId, event.contentStart.role);
  if (event.textOutput) {
    const role = blocks.get(event.textOutput.contentName || event.textOutput.contentId) || event.textOutput.role;
    if (role === 'USER') userText = true;
    if (role === 'ASSISTANT') assistantText = true;
  }
  if (event.audioOutput) audioBytes += Buffer.from(event.audioOutput.content, 'base64').length;
  if (event.hearthAction) { console.log(`Requested action: ${event.hearthAction.action}`); performedAction = event.hearthAction.action === process.env.HEARTH_EXPECT_ACTION; socket.send(JSON.stringify({ type: 'action-result', toolUseId: event.hearthAction.toolUseId, ok: true })); }
  if (audioBytes > 20000 && userText && assistantText && (!process.env.HEARTH_EXPECT_ACTION || performedAction)) {
    console.log(`End-to-end voice passed: microphone PCM → WebSocket → Nova Sonic → captions + ${audioBytes} response audio bytes.${performedAction ? ' Expected action requested and test-client acknowledgment returned.' : ''}`);
    socket.close(1000, 'Test complete');
  }
});
socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
socket.on('close', () => { clearTimeout(timeout); clearInterval(interval); if (!audioBytes || !userText || !assistantText) process.exitCode = 1; });
