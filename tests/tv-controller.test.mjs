import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createTvController } from '../lib/tv-controller.mjs';
import { createServer } from '../server.mjs';
import { MovieNight } from '../public/movie-night.js';
import { validateWorldAction } from '../public/actions.js';

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hearth-tv-'));
  const env = { HEARTH_TV_ENABLED: 'true', HEARTH_TV_TOKEN: 'test-owner-key-'.repeat(3), HEARTH_TV_ADB_SERIAL: '192.168.1.4:5555', HEARTH_TV_EXPIRES_AT: '2030-01-01T01:00:00Z', HEARTH_TV_PROFILE_FILE: path.join(directory, 'viewer.json'), HEARTH_TV_CATALOG_FILE: path.join(directory, 'catalog.json') };
  await writeFile(env.HEARTH_TV_CATALOG_FILE, JSON.stringify([{ id: 'B000000001', title: 'Test catalog title', genres: 'Comedy', minutes: 24 }]));
  const calls = [];
  env.HEARTH_TV_PRIME_PACKAGE = 'com.amazon.avod';
  const options = { env, now: () => Date.parse('2030-01-01T00:00:00Z'), run: async (file, args, options) => { calls.push({ file, args, options }); return { stdout: args.at(-1) === 'get-state' ? 'device\n' : 'Status: ok' }; } };
  return { env, calls, options, controller: createTvController(options), clean: () => rm(directory, { recursive: true, force: true }) };
}

test('TV bridge fails closed without opt-in, strong token, or a live permission window', async () => {
  const setup = await fixture();
  try {
    assert.equal(setup.controller.authorized(setup.env.HEARTH_TV_TOKEN), true);
    assert.equal(setup.controller.authorized('wrong'), false);
    for (const overrides of [{ HEARTH_TV_ENABLED: 'false' }, { HEARTH_TV_TOKEN: 'short' }, { HEARTH_TV_EXPIRES_AT: 'invalid' }, { HEARTH_TV_ADB_SERIAL: 'device;reboot' }]) {
      const controller = createTvController({ ...setup.options, env: { ...setup.env, ...overrides } });
      assert.equal(controller.authorized(setup.env.HEARTH_TV_TOKEN), false);
      assert.equal((await controller.execute({ action: 'prime' })).ok, false);
    }
    const expired = createTvController({ ...setup.options, now: () => Date.parse('2030-01-02T00:00:00Z') });
    assert.equal((await expired.execute({ action: 'prime' })).ok, false);
    assert.equal(setup.calls.length, 0);
  } finally { await setup.clean(); }
});

test('TV commands use fixed ADB arguments and never accept shell commands or invented titles', async () => {
  const setup = await fixture();
  try {
    for (const command of [{ action: 'shell', text: 'reboot' }, { action: 'pause', shell: 'reboot' }, { action: 'title', id: 'B999999999' }]) assert.equal((await setup.controller.execute(command)).ok, false);
    const result = await setup.controller.execute({ action: 'pause' });
    assert.equal(result.ok, true); assert.match(result.summary, /not verified/);
    assert.deepEqual(setup.calls.at(-1).args, ['-s', setup.env.HEARTH_TV_ADB_SERIAL, 'shell', 'input', 'keyevent', '127']);
    assert.equal(setup.calls.at(-1).file, 'adb'); assert.equal(setup.calls.at(-1).options.timeout, 2000);
    assert.equal((await setup.controller.execute({ action: 'stop' })).ok, true);
    assert.deepEqual(setup.calls.at(-1).args.slice(-2), ['keyevent', '86']);
    assert.equal((await setup.controller.execute({ action: 'return' })).ok, true);
    assert.deepEqual(setup.calls.at(-1).args.slice(-2), ['-n', 'com.hearth.tv/.MainActivity']);
  } finally { await setup.clean(); }
});

test('title launches record requests, not inferred watched episodes or playback progress', async () => {
  const setup = await fixture();
  try {
    const result = await setup.controller.execute({ action: 'title', id: 'B000000001' });
    assert.equal(result.ok, true); assert.match(result.summary, /not verified/);
    assert.ok(setup.calls.at(-1).args.includes('https://www.amazon.com/gp/video/detail/B000000001'));
    const saved = JSON.parse(await readFile(setup.env.HEARTH_TV_PROFILE_FILE, 'utf8'));
    assert.equal(saved.history[0].type, 'launch-request');
    assert.equal(saved.history[0].position, undefined);
  } finally { await setup.clean(); }
});

test('Prime searches are restricted to supplied suggestions and the exact owner package', async () => {
  const setup=await fixture();
  try {
    assert.equal((await setup.controller.execute({action:'prime-search',text:'unknown injected title'})).ok,false);
    const result=await setup.controller.execute({action:'prime-search',text:'Paddington'});
    assert.equal(result.ok,true);assert.match(result.summary,/not verified/);
    assert.ok(setup.calls.at(-1).args.includes('https://www.primevideo.com/search?phrase=Paddington'));
    assert.deepEqual(setup.calls.at(-1).args.slice(-2),['-p','com.amazon.avod']);
  }finally{await setup.clean();}
});

test('viewer preferences and explicit reviews survive controller restart and can be deleted', async () => {
  const setup = await fixture();
  try {
    await setup.controller.execute({ action: 'preferences', text: 'Gentle mysteries; no gore.' });
    await setup.controller.execute({ action: 'review', text: 'I liked that short comedy.' });
    const restarted = createTvController(setup.options);
    const result = await restarted.execute({ action: 'profile' });
    assert.equal(result.profile.preferences, 'Gentle mysteries; no gore.');
    assert.equal(result.profile.history[0].type, 'viewer-review');
    await restarted.execute({ action: 'forget' });
    assert.deepEqual((await restarted.execute({ action: 'profile' })).profile, { preferences: '', history: [] });
  } finally { await setup.clean(); }
});

test('ADB failures and app resolution errors are not reported as success', async () => {
  const setup = await fixture();
  try {
    for (const run of [async () => { throw new Error('timeout'); }, async () => ({ stdout: 'Error: Activity not started' })]) {
      assert.equal((await createTvController({ ...setup.options, run }).execute({ action: 'prime' })).ok, false);
    }
  } finally { await setup.clean(); }
});

test('TV API requires same origin and bridge authentication before executing anything', async () => {
  const calls = [];
  const server = createServer({ tvController: { authorized: value => value === 'owner', execute: async command => { calls.push(command); return { ok: true }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [origin, token, expected] of [['https://evil.example', 'owner', 403], [url, 'bad', 403], [null, 'owner', 403], [url, 'owner', 200]]) {
      const response = await fetch(`${url}/api/tv`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify({ token, command: { action: 'pause' } }) });
      assert.equal(response.status, expected);
    }
    assert.equal(calls.length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('voice TV schema accepts only explicit TV actions and viewer context never includes the key', () => {
  assert.deepEqual(validateWorldAction({ action: 'tv-title', text: 'B000000001' }), { action: 'tv-title', text: 'B000000001' });
  assert.throws(() => validateWorldAction({ action: 'tv-shell', text: 'reboot' }));
  const night = new MovieNight({}); night.token = 'SECRET'; night.viewer = { preferences: 'Comedies', history: [] }; night.catalog = [];
  assert.equal(JSON.stringify(night.context()).includes('SECRET'), false);
  assert.equal(night.context(false).preferences, undefined);
});

test('voice status describes only the selected provider and labels sampled playback telemetry', async () => {
  const night = new MovieNight({});
  night.nativeControl = async () => ({}); night.endpoint = 'com.test.player';
  night.request = async () => ({ ok: true, summary: 'Discovered provider.', endpoints: [{ packageId: 'com.test.player', sessions: [{ title: 'Test title', status: 'PAUSED', positionSeconds: 123, sampledAtSeconds: 1000 }] }] });
  const result = await night.action('tv-status');
  assert.equal(result.ok, true); assert.match(result.summary, /Test title: PAUSED/); assert.match(result.summary, /sampled position 123/);
  night.endpoint = '';
  assert.match((await night.action('tv-status')).summary, /No media app is selected/);
});
