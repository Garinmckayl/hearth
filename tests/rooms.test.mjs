import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createServer } from '../server.mjs';

test('private phone pairing relays voice and ends when the television leaves', async () => {
  const server = createServer({ connected: false, voiceEnabled: false, pairingTtlMs: 1000 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/api/rooms`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ context: { voice: 'tiffany', memories: [] } }) });
  assert.equal(response.status, 201);
  const room = await response.json();
  assert.notEqual(room.token, room.hostToken);
  assert.equal(room.joinUrl.includes(room.hostToken), false);
  const qr = await fetch(`${origin}/api/rooms/${room.token}/qr`);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  const host = new WebSocket(`${origin.replace('http', 'ws')}/api/room-stream?room=${room.token}&host=${room.hostToken}`, { headers: { Origin: origin } });
  let phone;
  try {
    const waiting = once(host, 'message'); await once(host, 'open');
    assert.equal(JSON.parse((await waiting)[0]).type, 'waiting');
    const connected = once(host, 'message');
    phone = new WebSocket(`${origin.replace('http', 'ws')}/api/room-stream?room=${room.token}`, { headers: { Origin: origin } });
    const context = once(phone, 'message'); await once(phone, 'open');
    assert.equal(JSON.parse((await context)[0]).context.voice, 'tiffany');
    assert.equal(JSON.parse((await connected)[0]).type, 'phone-connected');
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(host.readyState, WebSocket.OPEN);
    assert.equal(phone.readyState, WebSocket.OPEN);
    const relayed = once(host, 'message');
    phone.send(JSON.stringify({ type: 'voice-event', event: { audioOutput: { content: 'AAAA' } } }));
    assert.equal(JSON.parse((await relayed)[0]).event.audioOutput.content, 'AAAA');
    const ended = once(phone, 'close'); host.close(); await ended;
    assert.equal((await fetch(`${origin}/api/rooms/${room.token}/qr`)).status, 404);
  } finally { host.terminate(); phone?.terminate(); await new Promise(resolve => server.close(resolve)); }
});

test('foreign origins cannot create a pairing', async () => {
  const server = createServer({ connected: false, voiceEnabled: false });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rooms`, { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
