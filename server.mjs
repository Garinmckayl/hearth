import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateReply, validateInput } from './lib/dialogue.mjs';
import { attachVoiceServer } from './lib/voice-server.mjs';
import { VOICES } from './lib/sonic.mjs';
import { synthesizeSpeech } from './lib/speech.mjs';
import { attachRooms } from './lib/rooms.mjs';

const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wav': 'audio/wav' };

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 160000) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

export function createServer({ connected = Boolean(process.env.BEDROCK_MODEL_ID), dialogue = generateReply, voiceEnabled = process.env.NOVA_SONIC_ENABLED === 'true', voiceSession, attention, transcriber, renewalMs, pairingTtlMs } = {}) {
  let activeRequests = 0;
  const recentRequests = new Map();
  let rooms;
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const origin = request.headers.origin;
      const nativeOrigin = origin === 'https://hearth.local' && process.env.ALLOW_NATIVE_CLIENT === 'true';
      if (pathname.startsWith('/api/') && nativeOrigin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
        response.writeHead(nativeOrigin ? 204 : 403).end();
        return;
      }
      if (pathname === '/api/config' && request.method === 'GET') { json(response, 200, { dialogue: connected ? 'bedrock' : 'story', voice: voiceEnabled ? 'nova-sonic' : 'device', voices: VOICES, attention: voiceEnabled && process.env.OPENROUTER_API_KEY ? 'jev' : 'unavailable' }); return; }
      if (pathname === '/api/rooms' && request.method === 'POST') {
        if (origin && !nativeOrigin && new URL(origin).host !== request.headers.host) { json(response, 403, { error: 'Same-origin requests only.' }); return; }
        try {
          const input = await readBody(request);
          const scheme = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
          const room = rooms.create(input.context || {}, `${scheme}://${request.headers.host}`);
          json(response, 201, room);
        } catch { json(response, 400, { error: 'The room could not be created.' }); }
        return;
      }
      if (pathname.startsWith('/api/rooms/') && pathname.endsWith('/qr') && request.method === 'GET') {
        try { const image = await rooms.qr(pathname.split('/')[3]); response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); response.end(image); }
        catch { json(response, 404, { error: 'Room expired.' }); }
        return;
      }
      if (pathname === '/api/speak' && request.method === 'POST') {
        if (!voiceEnabled) { json(response, 503, { error: 'Cozy voice is unavailable.' }); return; }
        if (origin && !nativeOrigin && new URL(origin).host !== request.headers.host) { json(response, 403, { error: 'Same-origin requests only.' }); return; }
        if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 415, { error: 'JSON is required.' }); return; }
        let body;
        try { body = await readBody(request); if (typeof body.text !== 'string' || body.text.length > 800 || !VOICES.includes(body.voice)) throw new Error('Invalid speech'); }
        catch { json(response, 400, { error: 'Invalid speech request.' }); return; }
        try {
          const audio = await synthesizeSpeech(body.text, body.voice);
          response.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }); response.end(audio);
        } catch { json(response, 503, { error: 'Cozy voice is unavailable. Captions are here.' }); }
        return;
      }
      if (pathname === '/api/dialogue' && request.method === 'POST') {
        if (!connected) { json(response, 503, { error: 'Connected dialogue is not configured.' }); return; }
        if (origin && !nativeOrigin && new URL(origin).host !== request.headers.host) { json(response, 403, { error: 'Same-origin requests only.' }); return; }
        if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 415, { error: 'JSON is required.' }); return; }
        if (activeRequests >= 3) { json(response, 429, { error: 'Please try again in a moment.' }); return; }
        const address = request.socket.remoteAddress;
        const now = Date.now();
        for (const [key, entry] of recentRequests) { if (now - entry.start > 60000) recentRequests.delete(key); }
        const usage = recentRequests.get(address) || { start: now, count: 0 };
        if (usage.count >= 30) { json(response, 429, { error: 'Please take a moment before continuing.' }); return; }
        usage.count++; recentRequests.set(address, usage);
        let input;
        try { input = validateInput(await readBody(request)); }
        catch { json(response, 400, { error: 'Invalid dialogue request.' }); return; }
        activeRequests++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        response.on('close', () => controller.abort());
        try { json(response, 200, await dialogue(input, controller.signal)); }
        catch { json(response, 503, { error: 'Pip’s connected dialogue is unavailable. Story mode is still here.' }); }
        finally { clearTimeout(timer); activeRequests--; }
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) { json(response, 405, { error: 'Method not allowed.' }); return; }
      const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(`${root}${path.sep}`)) { json(response, 403, { error: 'Forbidden.' }); return; }
      const content = await readFile(target);
      response.writeHead(200, { 'Content-Type': `${types[path.extname(target)] || 'application/octet-stream'}${types[path.extname(target)]?.startsWith('text/') ? '; charset=utf-8' : ''}`, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { json(response, 404, { error: 'Not found.' }); }
  });
  attachVoiceServer(server, { enabled: voiceEnabled, ...(voiceSession ? { createSession: voiceSession } : {}), ...(attention ? { attention } : {}), ...(transcriber ? { createTranscriber: transcriber } : {}), ...(renewalMs ? { renewalMs } : {}) });
  rooms = attachRooms(server, pairingTtlMs ? { pairingTtlMs } : {});
  server.on('upgrade', (request, socket) => { if (!['/api/voice', '/api/room-stream'].includes(new URL(request.url, 'http://localhost').pathname)) socket.destroy(); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => console.log(`Hearth is home at http://${host}:${port}`));
}
