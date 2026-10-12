import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { classifyAttention } from '../lib/attention.mjs';
import { AmbientTranscriber } from '../lib/transcriber.mjs';
import { createServer } from '../server.mjs';

test('Jev uses the Decisions API and uncertain or invalid decisions fail closed', async () => {
  const original = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-only';
  try {
    let body;
    const fetcher = async (_url, request) => { body = JSON.parse(request.body); return { ok: true, json: async () => ({ answers: { directed: { type: 'noul', noul: .92 }, side_conversation: { type: 'noul', noul: .1 }, echo: { type: 'noul', noul: .1 } } }) }; };
    assert.equal((await classifyAttention({ text: 'Would you dance?' }, { fetcher })).accepted, true);
    assert.equal(body.questions.directed.type, 'noul');
    assert.equal(body.state.utterance, 'Would you dance?');
    const uncertain = async () => ({ ok: true, json: async () => ({ answers: { directed: { type: 'noul', noul: .6 }, side_conversation: { type: 'noul', noul: .1 }, echo: { type: 'noul', noul: .1 } } }) });
    assert.equal((await classifyAttention({ text: 'Maybe.' }, { fetcher: uncertain })).accepted, false);
    assert.equal((await classifyAttention({ text: 'Can you hear me?', opening: true }, { fetcher: uncertain })).accepted, true);
    await classifyAttention({ text: 'Hey, what’s up?', opening: true }, { fetcher });
    assert.equal(body.state.user_just_started_pips_microphone, true);
    const sideConversation = async () => ({ ok: true, json: async () => ({ answers: { directed: { type: 'noul', noul: .8 }, side_conversation: { type: 'noul', noul: .8 }, echo: { type: 'noul', noul: .1 } } }) });
    assert.equal((await classifyAttention({ text: 'John, pass the salt.', opening: true }, { fetcher: sideConversation })).accepted, false);
    assert.equal((await classifyAttention({ text: 'She was wonderful.', engaged: true, recentTurns: [{ role: 'assistant', text: 'How was the recital?' }] }, { fetcher: uncertain })).accepted, true);
    await assert.rejects(classifyAttention({ text: 'Hello' }, { fetcher: async () => ({ ok: true, json: async () => ({ answers: {} }) }) }));
  } finally { if (original === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = original; }
});

test('ambient audio queue stays bounded and releases waiters on stop', async () => {
  const transcriber = new AmbientTranscriber({ client: {}, onUtterance() {} });
  const iterator = transcriber.stream();
  const pending = iterator.next();
  for (let index = 0; index < 5; index++) transcriber.audio(Buffer.alloc(640));
  assert.equal((await pending).value.AudioEvent.AudioChunk.length, 3200);
  const waiting = iterator.next(); transcriber.stop();
  assert.equal((await waiting).done, true);
});

test('final transcription segments form one turn and stopping discards buffered speech', () => {
  const turns = [];
  const transcriber = new AmbientTranscriber({ client: {}, onUtterance: text => turns.push(text) });
  transcriber.turnParts.push('Pip', 'Please dance for me.');
  transcriber.flushTurn();
  assert.deepEqual(turns, ['Pip Please dance for me.']);
  transcriber.turnParts.push('Never deliver this after stop.');
  transcriber.stop(); transcriber.flushTurn();
  assert.equal(turns.length, 1);
});

test('ambient side conversation never enters Sonic, while accepted turns do', async () => {
  const receivedAudio = []; const acceptedTexts = []; const decisions = [];
  let onUtterance; let stopped = false;
  const server = createServer({ connected: false, voiceEnabled: true,
    attention: async ({ text }) => { decisions.push(text); if (text === 'classifier failure') throw new Error('offline'); return { accepted: text === 'Please dance.', reason: text === 'Please dance.' ? 'for-pip' : 'side-conversation', latencyMs: 1 }; },
    transcriber: options => { onUtterance = options.onUtterance; return { run: async () => {}, audio() {}, stop: () => { stopped = true; } }; },
    voiceSession: options => ({ run: async () => options.onEvent({ ready: true }), audio: bytes => receivedAudio.push(bytes), text: text => acceptedTexts.push(text), stop() {} })
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const socket = new WebSocket(`${origin.replace('http', 'ws')}/api/voice`, { headers: { Origin: origin } });
  const events = []; socket.on('message', bytes => events.push(JSON.parse(bytes)));
  try {
    await once(socket, 'open'); const ready = once(socket, 'message'); socket.send(JSON.stringify({ type: 'start', voice: 'tiffany', mode: 'ambient' })); await ready;
    socket.send(Buffer.alloc(640, 255)); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(receivedAudio[0].every(byte => byte === 0), true);
    onUtterance('John, pass the salt.'); onUtterance('Please dance.');
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.deepEqual(acceptedTexts, ['Please dance.']);
    assert.equal(events.some(event => JSON.stringify(event).includes('salt')), false);
    onUtterance('classifier failure'); await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(acceptedTexts, ['Please dance.']);
    socket.send(JSON.stringify({ type: 'pause', paused: true })); await new Promise(resolve => setTimeout(resolve, 10));
    onUtterance('Please dance.'); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(decisions.length, 3);
    socket.close(); await once(socket, 'close'); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(stopped, true);
  } finally { socket.terminate(); await new Promise(resolve => server.close(resolve)); }
});
