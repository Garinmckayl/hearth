import type {IMediaControlEndpointLocatorAsync, IMediaControlClientAsync, MediaSessionState} from '@amazon-devices/kepler-media-controls';

export type LaunchTarget = {id: string; title: string; url: string};
export type TvCommand = {action: string; id?: string; endpoint?: string; text?: string};
type Dependencies = {
  makeLocator: () => IMediaControlEndpointLocatorAsync;
  canOpenURL: (url: string) => Promise<boolean>;
  openURL: (url: string) => Promise<unknown>;
  targets: LaunchTarget[];
};

async function bounded<Result>(operation: Promise<Result>): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Native media request timed out')), 2000); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

async function snapshot(states: MediaSessionState[], client: IMediaControlClientAsync) {
  return Promise.all(states.slice(0, 8).map(async state => {
    let title: string | null = null;
    try { if (state.mediaInfo?.id) title = (await bounded(client.getMetadata(state.mediaInfo.id))).title?.slice(0, 160) || null; } catch {}
    return {
      sessionId: state.id.id,
      title,
      status: state.playbackState.playbackStatus,
      positionSeconds: state.playbackState.position?.position.seconds ?? null,
      sampledAtSeconds: state.playbackState.position?.updatedAtTime.seconds ?? null,
      mediaId: state.mediaInfo?.id ?? null,
      actions: state.capabilities.actions.map(action => action.name),
    };
  }));
}

export function createVegaTvControl(dependencies: Dependencies) {
  let busy = false;
  return async (command: TvCommand) => {
    if (busy) return {ok: false, summary: 'Another native TV operation is in progress.'};
    busy = true;
    let clients: IMediaControlClientAsync[] = [];
    try {
      if (!command || Object.keys(command).some(key => !['action', 'id', 'endpoint', 'text'].includes(key))) throw new Error('Invalid command');
      if (command.action === 'prime-search') {
        if (typeof command.text !== 'string' || !command.text.trim() || command.text.length > 160) throw new Error('Invalid Prime search');
        const url = `https://www.primevideo.com/search?phrase=${encodeURIComponent(command.text)}`;
        if (!await bounded(dependencies.canOpenURL(url))) return {ok:false,summary:'No installed Vega app handles the Prime Video search link. No movie has started.'};
        await bounded(dependencies.openURL(url));
        return {ok:true,summary:`Vega accepted a Prime Video search for ${command.text}. Confirm the correct title, access, and playback in the opened app.`};
      }
      if (['prime', 'title'].includes(command.action)) {
        const target = dependencies.targets.find(item => item.id === (command.action === 'prime' ? 'prime' : command.id)) || (command.action === 'prime' ? {id:'prime',title:'Prime Video',url:'https://www.primevideo.com/'} : undefined);
        if (!target) return {ok: false, summary: 'No approved Vega launch link is configured for that app or title. Prime Video is not assumed to be installed.'};
        if (!await bounded(dependencies.canOpenURL(target.url))) return {ok: false, summary: `No installed Vega app handles the approved link for ${target.title}.`};
        await bounded(dependencies.openURL(target.url));
        return {ok: true, summary: `Vega accepted the approved launch link for ${target.title}. Playback has not been verified.`};
      }
      if (!['status', 'play', 'pause', 'stop'].includes(command.action)) return {ok: false, summary: 'This operation is not supported by the native Vega adapter.'};
      let acceptingClients = true;
      try {
        clients = await bounded(dependencies.makeLocator().getMediaControlEndpoints().then(found => {
          if (!acceptingClients) found.forEach(client => client.destroy());
          return found;
        }));
      } finally { acceptingClients = false; }
      if (command.action === 'status') {
        const endpoints = await Promise.all(clients.map(async client => {
          const packageId = client.getEndpointPackageId().id;
          try { return {packageId, sessions: await snapshot(await bounded(client.getSessionState()), client)}; }
          catch { return {packageId, sessions: [], unavailable: true}; }
        }));
        return {ok: true, endpoints, catalog: dependencies.targets.filter(item => item.id !== 'prime').map(({id, title}) => ({id, title})), summary: `Vega discovered ${endpoints.length} media endpoint(s). No assumption is made that Prime Video is available.`};
      }
      if (!command.endpoint) return {ok: false, summary: 'Choose a discovered media app before controlling playback.'};
      const client = clients.find(item => item.getEndpointPackageId().id === command.endpoint);
      if (!client) return {ok: false, summary: 'The selected media app is no longer available. Discover endpoints again.'};
      const before = await bounded(client.getSessionState());
      const supported = before.some(state => state.capabilities.actions.some(action => action.name === command.action.toUpperCase()));
      if (!supported) return {ok: false, summary: 'That media endpoint does not currently advertise the requested control.'};
      if (command.action === 'play') await bounded(client.play());
      else if (command.action === 'pause') await bounded(client.pause());
      else await bounded(client.stop());
      let states;
      try { states = await snapshot(await bounded(client.getSessionState()), client); } catch {}
      return {ok: true, endpoint: command.endpoint, sessions: states, summary: `${command.endpoint} acknowledged ${command.action}.${states ? ` Reported state: ${states.map(state => state.status).join(', ') || 'no sessions'}.` : ' Updated playback state is unavailable.'} This is provider telemetry, not proof of rendered video or a complete watch history.`};
    } catch { return {ok: false, summary: 'The native Vega operation failed or timed out. Its outcome is unconfirmed; check the screen before retrying.'}; }
    finally { clients.forEach(client => { try { client.destroy(); } catch {} }); busy = false; }
  };
}

export const TV_BRIDGE_SCRIPT = `
(() => {
  let nextId = 0;
  const pending = new Map();
  window.addEventListener('hearth:native-tv-result', event => {
    const request = pending.get(event.detail.id);
    if (!request) return;
    pending.delete(event.detail.id); clearTimeout(request.timer); request.resolve(event.detail.result);
  });
  window.HearthNative = {
    backendUrl: () => '',
    exit: () => {window.hearthPause?.(); window.ReactNativeWebView.postMessage('hearth:exit');},
    tvControl: command => new Promise(resolve => {
      if (pending.size >= 4) { resolve({ok: false, summary: 'Too many pending TV commands.'}); return; }
      const id = String(++nextId);
      const timer = setTimeout(() => {pending.delete(id); resolve({ok: false, summary: 'Native TV operation timed out; its outcome is unknown. Check the screen before retrying.'});}, 12000);
      pending.set(id, {resolve, timer});
      window.ReactNativeWebView.postMessage(JSON.stringify({type: 'hearth:tv', id, command}));
    })
  };
})(); true;
`;
