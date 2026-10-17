import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

export function attachRooms(server, { pairingTtlMs = 900000, tvController } = {}) {
  const rooms = new Map();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64000 });
  const send = (socket, message) => { if (socket?.readyState === 1 && socket.bufferedAmount < 1000000) socket.send(JSON.stringify(message)); };
  const remove = room => { if (!rooms.delete(room.token)) return; room.host?.close(1000, 'Room closed'); room.phone?.close(1000, 'Room closed'); clearTimeout(room.timer); clearTimeout(room.sessionTimer); for (const pending of room.pending.values()) clearTimeout(pending.timer); };
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/api/room-stream') return;
    const room = rooms.get(url.searchParams.get('room'));
    const host = url.searchParams.get('host') === room?.hostToken;
    let validOrigin = false;
    try { validOrigin = new URL(request.headers.origin).host === request.headers.host || (request.headers.origin === 'https://hearth.local' && process.env.ALLOW_NATIVE_CLIENT === 'true'); } catch {}
    if (!room || !validOrigin || (host ? room.host : room.phone)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(request, socket, head, connection => {
      if (host) { room.host = connection; room.hostActive = true; send(connection, { type: 'waiting' }); send(room.phone,{type:'host-state',active:true}); }
      else { clearTimeout(room.timer); room.expiresAt = null; room.phone = connection; send(connection, { type: 'context', context: room.context, hostActive:room.hostActive }); if (room.playback) send(connection,{type:'playback',playback:room.playback}); send(room.host, { type: 'phone-connected' }); }
      connection.on('message', async data => {
        try {
          const message = JSON.parse(data.toString());
          if (host && message.type === 'host-state' && room.context.cowatch === true && typeof message.active === 'boolean') {
            room.hostActive = message.active; send(room.phone,{type:'host-state',active:message.active});
          } else if (host && message.type === 'delegate-tv' && room.context.cowatch === true) {
            room.remoteAllowed = tvController?.authorized(message.token) === true;
            send(connection,{type:'status',text:room.remoteAllowed ? 'Phone TV controls authorized for this session.' : 'The TV bridge did not authorize phone controls.'});
          } else if (host && message.type === 'playback' && room.context.cowatch === true) {
            const p = message.playback;
            if (p !== null && (!p || typeof p.title !== 'string' || p.title.length > 160 || !['PLAYING','PAUSED','ENDED','ERROR'].includes(p.status) || !Number.isFinite(p.positionSeconds) || p.positionSeconds < 0 || p.positionSeconds > 86400)) throw new Error('Invalid playback');
            room.playback = p === null ? null : {title:p.title,status:p.status,positionSeconds:p.positionSeconds,provider:'Hearth Cinema',sampledAt:Date.now()};
            send(room.phone,{type:'playback',playback:room.playback});
          } else if (!host && message.type === 'tv-command' && room.context.cowatch === true) {
            const {id,command} = message;
            if (typeof id !== 'string' || !/^\d{1,12}$/.test(id) || room.pending.has(id) || room.pending.size >= 4 || !command || Object.keys(command).some(key=>!['action','id','text'].includes(key)) || !['status','providers','play','pause','stop','back','return','prime','prime-search','title'].includes(command.action)) throw new Error('Invalid TV command');
            if (room.hostActive && room.host?.readyState === 1) {
              const timer = setTimeout(()=>{room.pending.delete(id);send(room.phone,{type:'control-result',id,result:{ok:false,summary:'The TV did not respond. Its playback state is unknown.'}});},6000); timer.unref();
              room.pending.set(id,{timer}); send(room.host,{type:'control-request',id,command});
            } else {
              const result = room.remoteAllowed ? await tvController.execute(command) : {ok:false,summary:'Pip is still connected on your phone, but this TV app cannot accept background controls. An authorized Fire OS bridge is required for cross-app remote control.'};
              send(room.phone,{type:'control-result',id,result});
            }
          } else if (host && message.type === 'control-result' && room.pending.has(message.id)) {
            if (typeof message.result?.ok !== 'boolean' || typeof message.result.summary !== 'string' || message.result.summary.length > 1500) throw new Error('Invalid command result');
            clearTimeout(room.pending.get(message.id).timer);room.pending.delete(message.id);send(room.phone,{type:'control-result',id:message.id,result:message.result});
          } else if (!host && message.type === 'speaking' && room.context.cowatch === true && typeof message.active === 'boolean') send(room.host,{type:'speaking',active:message.active});
          else if (!host && message.type === 'voice-event') {
            const event = message.event;
            const keys = Object.keys(event || {});
            if (keys.length !== 1 || !['ready', 'contentStart', 'textOutput', 'audioOutput', 'contentEnd', 'hearthAction', 'attention', 'acceptedUtterance'].includes(keys[0])) throw new Error('Unsupported event');
            send(room.host, { type: 'voice-event', event });
          } else if (!host && message.type === 'status' && typeof message.text === 'string' && message.text.length <= 160) send(room.host, message);
          else if (host && message.type === 'action-result' && typeof message.result?.toolUseId === 'string' && message.result.toolUseId.length <= 200 && typeof message.result.ok === 'boolean' && (message.result.summary === undefined || typeof message.result.summary === 'string' && message.result.summary.length <= 1000)) send(room.phone, { type: 'action-result', result: { toolUseId: message.result.toolUseId, ok: message.result.ok, ...(message.result.summary ? { summary: message.result.summary } : {}) } });
          else if (host && message.type === 'user-text' && typeof message.text === 'string' && message.text.trim() && message.text.length <= 500) send(room.phone, { type: 'user-text', text: message.text });
          else if (message.type === 'stop' && (host || room.context.cowatch === true)) remove(room);
          else throw new Error('Invalid room input');
        } catch { connection.close(1008, 'Invalid room input'); }
      });
      connection.on('error', () => connection.close());
      connection.on('close', () => {
        if (!rooms.has(room.token)) return;
        if (host) { room.host = null; room.hostActive = false; if (room.context.cowatch === true && room.phone) send(room.phone,{type:'host-state',active:false}); else remove(room); }
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
      const room = { token, hostToken: randomUUID(), context, expiresAt: Date.now() + pairingTtlMs, joinUrl: `${origin}/?join=${token}`, host: null, phone: null, hostActive:true, remoteAllowed:false, pending:new Map() };
      if (context.cowatch === true) {room.sessionTimer=setTimeout(()=>remove(room),3*60*60*1000);room.sessionTimer.unref();}
      room.timer = setTimeout(() => remove(room), pairingTtlMs); room.timer.unref(); rooms.set(token, room);
      return { token, hostToken: room.hostToken, expiresAt: room.expiresAt, joinUrl: room.joinUrl };
    },
    async qr(token) { const room = rooms.get(token); if (!room) throw new Error('Room expired'); return QRCode.toBuffer(room.joinUrl, { width: 280, margin: 2, color: { dark: '#263025', light: '#eee8d8' } }); }
  };
}
