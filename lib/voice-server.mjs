import { WebSocketServer } from 'ws';
import { SonicSession, VOICES } from './sonic.mjs';
import { classifyAttention } from './attention.mjs';
import { AmbientTranscriber } from './transcriber.mjs';

export function attachVoiceServer(server, { enabled = process.env.NOVA_SONIC_ENABLED === 'true', createSession = options => new SonicSession(options), attention = classifyAttention, createTranscriber = options => new AmbientTranscriber(options), renewalMs = 240000 } = {}) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64000 });
  let active = 0;
  const attempts = new Map();
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/api/voice') return;
    const origin = request.headers.origin;
    const native = origin === 'https://hearth.local' && process.env.ALLOW_NATIVE_CLIENT === 'true';
    let permitted = false;
    try { permitted = Boolean(origin && (new URL(origin).host === request.headers.host || native)); } catch {}
    if (!enabled || !permitted || active >= 2) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    const address = request.socket.remoteAddress;
    const now = Date.now();
    for (const [key, entry] of attempts) if (now - entry.start > 60000) attempts.delete(key);
    const usage = attempts.get(address) || { start: now, count: 0 };
    if (usage.count >= 8) { socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return; }
    usage.count++; attempts.set(address, usage);
    sockets.handleUpgrade(request, socket, head, connection => sockets.emit('connection', connection, request));
  });
  sockets.on('connection', socket => {
    active++;
    let session;
    let lastAudio = Date.now();
    let started = false;
    let ambient = false;
    let paused = false;
    let transcriber;
    let decisionTimes = [];
    let pendingTurns = 0;
    let epoch = 0;
    let lastAccepted = 0;
    let openedAt = 0;
    let decisionChain = Promise.resolve();
    const lifetime = new AbortController();
    const recentTurns = [];
    const assistantBlocks = new Map();
    const pendingActions = new Map();
    const send = event => { if (socket.readyState === 1 && socket.bufferedAmount < 1000000) socket.send(JSON.stringify(event)); else socket.close(1008, 'Slow connection'); };
    let timeout = setTimeout(() => socket.close(1008, 'Start the microphone first'), 30000);
    const idle = setInterval(() => { if (Date.now() - lastAudio > 30000) socket.close(1000, 'Microphone inactive'); }, 10000);
    socket.on('message', (data, binary) => {
      try {
        if (binary) { lastAudio = Date.now(); if (!session) throw new Error('Start the session first.'); if (!data.length || data.length > 16000 || data.length % 2) throw new Error('Invalid PCM'); if (ambient) { transcriber.audio(paused ? Buffer.alloc(data.length) : data); session.audio(Buffer.alloc(data.length)); } else session.audio(data); return; }
        const message = JSON.parse(data.toString());
        if (message.type === 'start' && !started) {
          started = true;
          if (!VOICES.includes(message.voice)) throw new Error('Unsupported voice.');
          const context = message.context || {};
          clearTimeout(timeout);
          timeout = setTimeout(() => socket.close(1012, 'Renewing voice stream'), renewalMs);
          if (Array.isArray(context.recentConversation)) {
            for (const turn of context.recentConversation.slice(-8)) if (['user', 'assistant'].includes(turn.role) && typeof turn.text === 'string') recentTurns.push({ role: turn.role, text: turn.text.slice(0, 1000) });
            if (recentTurns.length) lastAccepted = Date.now();
          }
          ambient = message.mode === 'ambient';
          openedAt = Date.now();
          if (ambient && !process.env.OPENROUTER_API_KEY && attention === classifyAttention) throw new Error('Jev is not configured.');
          if (JSON.stringify(context).length > 28000) throw new Error('Too much memory context.');
          session = createSession({ voice: message.voice, context, onEvent: event => {
            const start = event.contentStart;
            if (start?.role === 'ASSISTANT' && start.type === 'TEXT') { let stage; try { stage = JSON.parse(start.additionalModelFields || '{}').generationStage; } catch {} if (stage !== 'SPECULATIVE') assistantBlocks.set(start.contentName || start.contentId, ''); }
            const output = event.textOutput;
            const key = output?.contentName || output?.contentId;
            if (output && assistantBlocks.has(key)) assistantBlocks.set(key, (assistantBlocks.get(key) + output.content).slice(0, 1000));
            const endKey = event.contentEnd?.contentName || event.contentEnd?.contentId;
            if (assistantBlocks.has(endKey)) { const text = assistantBlocks.get(endKey); if (text) recentTurns.push({ role: 'assistant', text }); assistantBlocks.delete(endKey); while (recentTurns.length > 8) recentTurns.shift(); }
            send(event);
          }, executeAction: action => new Promise(resolve => {
            if (pendingActions.size >= 4 || typeof action.toolUseId !== 'string' || action.toolUseId.length > 200) { resolve({ ok: false, error: 'Too many actions.' }); return; }
            const timer = setTimeout(() => { pendingActions.delete(action.toolUseId); resolve({ ok: false, error: 'The television did not confirm the action.' }); }, 5000);
            pendingActions.set(action.toolUseId, { resolve, timer, action: action.action });
            send({ hearthAction: action });
          }) });
          if (ambient) {
            transcriber = createTranscriber({ onUtterance: text => {
              if (paused || socket.readyState !== 1) return;
              decisionTimes = decisionTimes.filter(time => Date.now() - time < 60000);
              if (pendingTurns >= 3 || decisionTimes.length >= 30) { send({ attention: { accepted: false, reason: 'limit' } }); return; }
              const turnEpoch = epoch; pendingTurns++; decisionTimes.push(Date.now());
              decisionChain = decisionChain.then(async () => {
                if (paused || turnEpoch !== epoch || socket.readyState !== 1) return;
                send({ attention: { state: 'considering' } });
                try {
                  const decision = await attention({ text, recentTurns, engaged: Date.now() - lastAccepted < 90000, opening: lastAccepted === 0 && Date.now() - openedAt < 60000 }, { signal: lifetime.signal });
                  if (paused || turnEpoch !== epoch || socket.readyState !== 1) return;
                  send({ attention: { accepted: decision.accepted, reason: decision.reason, latencyMs: decision.latencyMs } });
                  if (decision.accepted) { lastAccepted = Date.now(); recentTurns.push({ role: 'user', text }); while (recentTurns.length > 8) recentTurns.shift(); send({ acceptedUtterance: { text } }); session.text(text); }
                } catch { if (socket.readyState === 1 && !paused && turnEpoch === epoch) send({ attention: { accepted: false, reason: 'unavailable' } }); }
              }).finally(() => { pendingTurns--; });
            } });
            transcriber.run().catch(() => { if (socket.readyState === 1) { send({ error: 'Hands-free transcription is unavailable. Start a regular voice conversation instead.' }); socket.close(1011, 'Transcription unavailable'); } });
          }
          session.run().catch(error => {
            if (socket.readyState === 1) { send({ error: 'Voice could not connect. Try again, or use a remote reply.', code: error.name || 'VoiceError' }); socket.close(1011, 'Voice unavailable'); }
          });
        } else if (message.type === 'pause' && ambient && typeof message.paused === 'boolean') { paused = message.paused; epoch++; transcriber?.setPaused?.(paused); }
        else if (message.type === 'text' && session && typeof message.text === 'string' && message.text.trim() && message.text.length <= 500) {
          decisionTimes = decisionTimes.filter(time => Date.now() - time < 60000);
          if (decisionTimes.length >= 30) { send({ attention: { accepted: false, reason: 'limit' } }); return; }
          decisionTimes.push(Date.now()); lastAccepted = Date.now();
          const text = message.text.trim(); recentTurns.push({ role: 'user', text }); while (recentTurns.length > 8) recentTurns.shift();
          send({ acceptedUtterance: { text } }); session.text(text);
        }
        else if (message.type === 'action-result') {
          const pending = pendingActions.get(message.toolUseId);
          if (typeof message.toolUseId !== 'string' || message.toolUseId.length > 200 || typeof message.ok !== 'boolean' || (message.summary !== undefined && (typeof message.summary !== 'string' || message.summary.length > 1000))) throw new Error('Invalid action result.');
          if (!pending) return;
          clearTimeout(pending.timer); pendingActions.delete(message.toolUseId);
          pending.resolve(message.ok ? { ok: true, action: pending.action, status: 'The television applied this action in Pip’s home.', ...(message.summary ? { summary: message.summary } : {}) } : { ok: false, action: pending.action, error: 'The television could not apply this action.' });
        } else if (message.type === 'stop') socket.close(1000, 'User ended conversation');
        else throw new Error('Unsupported voice message.');
      } catch { send({ error: 'The voice session could not process that input.' }); socket.close(1008, 'Invalid input'); }
    });
    socket.on('error', () => session?.stop());
    socket.on('close', () => { active--; epoch++; lifetime.abort(); transcriber?.stop(); clearTimeout(timeout); clearInterval(idle); session?.stop(); for (const pending of pendingActions.values()) { clearTimeout(pending.timer); pending.resolve({ ok: false, error: 'Conversation ended.' }); } pendingActions.clear(); });
  });
  server.on('close', () => { for (const socket of sockets.clients) socket.terminate(); sockets.close(); });
  return sockets;
}
