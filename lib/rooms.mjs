import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

export function attachRooms(server, { pairingTtlMs = 900000 } = {}) {
  const rooms = new Map();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64000 });
  const send = (socket, message) => { if (socket?.readyState === 1 && socket.bufferedAmount < 1000000) socket.send(JSON.stringify(message)); };
  const remove = room => { if (!rooms.delete(room.token)) return; room.host?.close(1000, 'Room closed'); room.phone?.close(1000, 'Room closed'); clearTimeout(room.timer); };
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/api/room-stream') return;
    const room = rooms.get(url.searchParams.get('room'));
    const host = url.searchParams.get('host') === room?.hostToken;
    let validOrigin = false;
    try { validOrigin = new URL(request.headers.origin).host === request.headers.host || (request.headers.origin === 'https://hearth.local' && process.env.ALLOW_NATIVE_CLIENT === 'true'); } catch {}
    if (!room || !validOrigin || (host ? room.host : room.phone)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(request, socket, head, connection => {
      if (host) { room.host = connection; send(connection, { type: 'waiting' }); }
      else { clearTimeout(room.timer); room.expiresAt = null; room.phone = connection; send(connection, { type: 'context', context: room.context }); send(room.host, { type: 'phone-connected' }); }
      connection.on('message', data => {
        try {
          const message = JSON.parse(data.toString());
          if (!host && message.type === 'voice-event') {
            const event = message.event;
            const keys = Object.keys(event || {});
            if (keys.length !== 1 || !['ready', 'contentStart', 'textOutput', 'audioOutput', 'contentEnd', 'hearthAction', 'attention', 'acceptedUtterance'].includes(keys[0])) throw new Error('Unsupported event');
            send(room.host, { type: 'voice-event', event });
          } else if (!host && message.type === 'status' && typeof message.text === 'string' && message.text.length <= 160) send(room.host, message);
          else if (host && message.type === 'action-result' && typeof message.result?.toolUseId === 'string' && message.result.toolUseId.length <= 200 && typeof message.result.ok === 'boolean') send(room.phone, { type: 'action-result', result: { toolUseId: message.result.toolUseId, ok: message.result.ok } });
          else if (host && message.type === 'stop') remove(room);
          else throw new Error('Invalid room input');
        } catch { connection.close(1008, 'Invalid room input'); }
      });
      connection.on('error', () => connection.close());
      connection.on('close', () => {
        if (host) { room.host = null; remove(room); }
        else { room.phone = null; send(room.host, { type: 'phone-left' }); room.timer = setTimeout(() => remove(room), pairingTtlMs); room.timer.unref(); }
      });
    });
  });
  const heartbeat = setInterval(() => { for (const socket of sockets.clients) if (socket.readyState === 1) socket.ping(); }, 20000);
  heartbeat.unref();
  server.on('close', () => { clearInterval(heartbeat); for (const room of [...rooms.values()]) remove(room); sockets.close(); });
  return {
    create(context, origin) {
      if (rooms.size >= 8) throw new Error('Rooms are busy.');
      if (JSON.stringify(context).length > 28000) throw new Error('Context too large');
      const token = randomUUID();
      const room = { token, hostToken: randomUUID(), context, expiresAt: Date.now() + pairingTtlMs, joinUrl: `${origin}/?join=${token}`, host: null, phone: null };
      room.timer = setTimeout(() => remove(room), pairingTtlMs); room.timer.unref(); rooms.set(token, room);
      return { token, hostToken: room.hostToken, expiresAt: room.expiresAt, joinUrl: room.joinUrl };
    },
    async qr(token) { const room = rooms.get(token); if (!room) throw new Error('Room expired'); return QRCode.toBuffer(room.joinUrl, { width: 280, margin: 2, color: { dark: '#263025', light: '#eee8d8' } }); }
  };
}
