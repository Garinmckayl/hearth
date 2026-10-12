import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { EventQueue, SonicSession } from '../lib/sonic.mjs';
import { encodeWav, synthesizeSpeech } from '../lib/speech.mjs';
import { createServer } from '../server.mjs';

test('voice events retain protocol order and close without leaking a pending iterator', async () => {
  const queue = new EventQueue();
  queue.push({ sessionStart: { inferenceConfiguration: { maxTokens: 512 } } });
  queue.push({ promptStart: { promptName: 'test' } });
  queue.close();
  const events = [];
  for await (const item of queue) events.push(JSON.parse(Buffer.from(item.chunk.bytes).toString()).event);
  assert.deepEqual(events.map(event => Object.keys(event)[0]), ['sessionStart', 'promptStart']);
  const pending = new EventQueue();
  const iterator = pending[Symbol.asyncIterator]();
  const result = iterator.next();
  pending.close();
  assert.equal((await result).done, true);
});

test('audio input accepts only bounded, complete 16-bit PCM frames', () => {
  const session = new SonicSession({ client: { destroy() {} } });
  session.startAudio();
  assert.throws(() => session.audio(Buffer.alloc(3)));
  assert.throws(() => session.audio(Buffer.alloc(16002)));
  session.audio(Buffer.alloc(640));
  assert.equal(session.queue.items.length, 2);
  session.stop();
});

test('warm voice WAV files have valid PCM format metadata', () => {
  const wav = encodeWav(Buffer.alloc(2400));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 2400);
});

test('scripted speech uses exact-text generative TTS rather than conversational generation', async () => {
  let request;
  const wav = await synthesizeSpeech('Pip, please dance.', 'tiffany', { send: async command => { request = command.input; return { AudioStream: { transformToByteArray: async () => new Uint8Array(3200) } }; } });
  assert.equal(request.Text, 'Pip, please dance.');
  assert.equal(request.TextType, 'text');
  assert.equal(request.Engine, 'generative');
  assert.equal(request.VoiceId, 'Tiffany');
  assert.equal(wav.readUInt32LE(24), 16000);
});

test('the WebSocket bridge streams PCM and stops the model when the user leaves', async () => {
  let stopped = false;
  let receivedAudio = 0;
  const server = createServer({ connected: false, voiceEnabled: true, voiceSession: options => ({
    run: async () => { options.onEvent({ ready: true }); },
    audio: bytes => { receivedAudio += bytes.length; options.onEvent({ textOutput: { content: 'Hello' } }); },
    stop: () => { stopped = true; }
  }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const socket = new WebSocket(origin.replace('http', 'ws') + '/api/voice', { headers: { Origin: origin } });
  try {
    await once(socket, 'open');
    const ready = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'start', voice: 'tiffany', context: { memories: [] } }));
    assert.equal(JSON.parse((await ready)[0]).ready, true);
    const response = once(socket, 'message');
    socket.send(Buffer.alloc(640));
    assert.equal(JSON.parse((await response)[0]).textOutput.content, 'Hello');
    assert.equal(receivedAudio, 640);
    socket.close(); await once(socket, 'close');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(stopped, true);
  } finally { socket.terminate(); await new Promise(resolve => server.close(resolve)); }
});

test('a foreign site cannot open the paid voice service', async () => {
  const server = createServer({ connected: false, voiceEnabled: true });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/voice`, { headers: { Origin: 'https://other.example' } });
  socket.on('error', () => {});
  try {
    const [, response] = await once(socket, 'unexpected-response');
    assert.equal(response.statusCode, 403);
    response.resume();
  } finally { socket.terminate(); await new Promise(resolve => server.close(resolve)); }
});

test('voice actions wait for television acknowledgment before reporting success', async () => {
  let result;
  const server = createServer({ connected: false, voiceEnabled: true, voiceSession: options => ({
    run: async () => {
      options.onEvent({ ready: true });
      result = await options.executeAction({ action: 'dance', toolUseId: 'dance-test' });
      options.onEvent({ testResult: result });
    }, audio() {}, stop() {}
  }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const socket = new WebSocket(`${origin.replace('http', 'ws')}/api/voice`, { headers: { Origin: origin } });
  try {
    await once(socket, 'open');
    const requested = new Promise(resolve => socket.on('message', data => { const event = JSON.parse(data); if (event.hearthAction) resolve(event.hearthAction); }));
    socket.send(JSON.stringify({ type: 'start', voice: 'tiffany' }));
    const action = await requested;
    assert.equal(action.action, 'dance'); assert.equal(result, undefined);
    const confirmed = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'action-result', toolUseId: action.toolUseId, ok: true }));
    const event = JSON.parse((await confirmed)[0]);
    assert.equal(event.testResult.ok, true);
    assert.equal(event.testResult.action, 'dance');
  } finally { socket.terminate(); await new Promise(resolve => server.close(resolve)); }
});
