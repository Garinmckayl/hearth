import type {IMediaControlClientAsync, IMediaControlEndpointLocatorAsync, MediaSessionState} from '@amazon-devices/kepler-media-controls';
import {createVegaTvControl} from '../src/tv-control';

function fixture() {
  let status = 'PLAYING';
  const client = {
    getEndpointPackageId: () => ({id: 'com.test.player'}),
    getSessionState: jest.fn(async () => [{id: {id: 1}, playbackState: {playbackStatus: status, playbackSpeed: 1, position: {position: {seconds: 123, nanoseconds: 0}, updatedAtTime: {seconds: 1000, nanoseconds: 0}}}, capabilities: {actions: [{name: 'PLAY'}, {name: 'PAUSE'}, {name: 'STOP'}]}, controls: []}] as unknown as MediaSessionState[]),
    pause: jest.fn(async () => { status = 'PAUSED'; }),
    play: jest.fn(async () => { status = 'PLAYING'; }),
    stop: jest.fn(async () => { status = 'NOT_PLAYING'; }),
    destroy: jest.fn(),
  };
  const locator = {getMediaControlEndpoints: jest.fn(async () => [client] as unknown as IMediaControlClientAsync[])};
  const dependencies = {
    makeLocator: () => locator as unknown as IMediaControlEndpointLocatorAsync,
    canOpenURL: jest.fn(async () => true), openURL: jest.fn(async () => {}),
    targets: [{id: 'prime', title: 'Configured app', url: 'approved-test://home'}, {id: 'B000000001', title: 'Configured title', url: 'approved-test://title'}],
  };
  return {client, locator, dependencies, control: createVegaTvControl(dependencies)};
}

test('discovers actual provider endpoints and sampled session state without assuming Prime', async () => {
  const {control, client} = fixture();
  const result = await control({action: 'status'});
  expect(result.ok).toBe(true);
  expect(result.endpoints?.[0].packageId).toBe('com.test.player');
  expect(result.endpoints?.[0].sessions[0].positionSeconds).toBe(123);
  expect(client.destroy).toHaveBeenCalledTimes(1);
});

test('requires an explicit matching endpoint and checks advertised capabilities', async () => {
  const {control, client} = fixture();
  expect((await control({action: 'pause'})).ok).toBe(false);
  expect((await control({action: 'pause', endpoint: 'com.unknown'})).ok).toBe(false);
  expect(client.pause).not.toHaveBeenCalled();
  const result = await control({action: 'pause', endpoint: 'com.test.player'});
  expect(client.pause).toHaveBeenCalledTimes(1);
  expect(result.sessions?.[0].status).toBe('PAUSED');
  expect(result.summary).toContain('provider telemetry');
});

test('does not route unsupported controls or generic shell commands', async () => {
  const {control, client} = fixture();
  client.getSessionState.mockResolvedValueOnce([{id: {id: 1}, playbackState: {playbackStatus: 'PLAYING'}, capabilities: {actions: []}, controls: []}] as unknown as MediaSessionState[]);
  expect((await control({action: 'pause', endpoint: 'com.test.player'})).ok).toBe(false);
  expect((await control({action: 'shell'})).ok).toBe(false);
  expect(client.pause).not.toHaveBeenCalled();
});

test('launches only approved links with an installed handler and does not claim playback', async () => {
  const {control, dependencies} = fixture();
  expect((await control({action: 'title', id: 'B999999999'})).ok).toBe(false);
  expect(dependencies.openURL).not.toHaveBeenCalled();
  dependencies.canOpenURL.mockResolvedValueOnce(false);
  expect((await control({action: 'prime'})).ok).toBe(false);
  expect(dependencies.openURL).not.toHaveBeenCalled();
  const result = await control({action: 'title', id: 'B000000001'});
  expect(result.ok).toBe(true); expect(result.summary).toContain('not been verified');
  expect(dependencies.openURL).toHaveBeenCalledWith('approved-test://title');
});

test('empty discovery and provider failures stay honest and release native clients', async () => {
  const {control, client, locator} = fixture();
  locator.getMediaControlEndpoints.mockResolvedValueOnce([]);
  const result = await control({action: 'status'});
  expect(result.endpoints).toEqual([]); expect(result.summary).toContain('0 media endpoint');
  client.pause.mockRejectedValueOnce(new Error('provider unavailable'));
  expect((await control({action: 'pause', endpoint: 'com.test.player'})).ok).toBe(false);
  expect(client.destroy).toHaveBeenCalledTimes(1);
});

test('Prime searches use a fixed HTTPS origin, encode titles, and require an installed handler', async () => {
  const {control,dependencies}=fixture();
  dependencies.canOpenURL.mockResolvedValueOnce(false);
  expect((await control({action:'prime-search',text:'A & B'})).ok).toBe(false);
  expect(dependencies.openURL).not.toHaveBeenCalled();
  const result=await control({action:'prime-search',text:'A & B'});
  expect(result.ok).toBe(true);
  expect(dependencies.openURL).toHaveBeenCalledWith('https://www.primevideo.com/search?phrase=A%20%26%20B');
  expect(result.summary).toContain('Confirm the correct title');
  expect((await control({action:'prime-search',text:''})).ok).toBe(false);
});

test('hung discovery times out without locking the controller and late clients are released', async () => {
  jest.useFakeTimers();
  const {control, locator, client} = fixture();
  let resolveDiscovery: (clients: IMediaControlClientAsync[]) => void = () => {};
  locator.getMediaControlEndpoints.mockImplementationOnce(() => new Promise(resolve => { resolveDiscovery = resolve; }));
  try {
    const pending = control({action: 'status'});
    await jest.advanceTimersByTimeAsync(2001);
    expect((await pending).ok).toBe(false);
    resolveDiscovery([client] as unknown as IMediaControlClientAsync[]);
    await Promise.resolve();
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect((await control({action: 'status'})).ok).toBe(true);
  } finally { jest.useRealTimers(); }
});
