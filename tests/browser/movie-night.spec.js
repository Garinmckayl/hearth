import { test, expect } from '@playwright/test';

test('native Vega controls discover explicit targets, preserve permission, and save sampled playback only on request', async ({ page }) => {
  await page.addInitScript(() => {
    window.nativeTvCommands = [];
    window.HearthNative = { backendUrl: () => '', tvControl: async command => {
      window.nativeTvCommands.push(command);
      return command.action === 'status' ? { ok: true, endpoints: [{ packageId: 'com.test.provider', sessions: [{ status: 'PAUSED', positionSeconds: 123, title: 'Provider test title' }] }], catalog: [], summary: 'Discovered one test provider.' } : { ok: true, summary: 'Provider acknowledged pause. Reported state: PAUSED.' };
    } };
  });
  await page.goto('/'); await page.locator('#room-button').click(); await page.locator('#movie-night').click(); await page.locator('#cinema-tv-controls').click();
  await expect(page.getByLabel('Owner bridge key')).toHaveCount(0);
  await page.getByRole('button', { name: 'Enable Vega TV controls this session' }).click();
  await expect(page.locator('#tv-status')).toContainText('Found 1 media endpoint');
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await expect(page.locator('#tv-status')).toContainText('Select a discovered');
  await page.getByLabel('Media app to control').selectOption('com.test.provider');
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  expect(await page.evaluate(() => window.nativeTvCommands.some(command => command.action === 'pause'))).toBe(false);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('#tv-confirmation')).toContainText('PAUSED');
  expect(await page.evaluate(() => window.nativeTvCommands.find(command => command.action === 'pause').endpoint)).toBe('com.test.provider');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hearth.viewer.v1') || '{}').history || [])).toEqual([]);
  await page.getByRole('button', { name: 'Remember this playback snapshot' }).click();
  await expect(page.locator('#tv-status')).toContainText('sampled playback state');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hearth.viewer.v1')));
  expect(saved.history[0].type).toBe('provider-snapshot'); expect(saved.history[0].title).toContain('123');
  await page.reload(); await page.locator('#room-button').click(); await page.locator('#movie-night').click(); await page.locator('#cinema-tv-controls').click();
  await expect(page.getByRole('button', { name: 'Enable Vega TV controls this session' })).toBeVisible();
});

test('voice TV request shows confirmation without claiming control or ending the conversation', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.route('**/api/config', route => route.fulfill({ json: { voice: 'nova-sonic' } }));
  const commands = []; const results = []; let socket; let started;
  await page.route('**/api/tv', route => {
    const { command } = route.request().postDataJSON(); commands.push(command);
    return route.fulfill({ json: command.action === 'profile' ? { ok: true, profile: { preferences: 'Short comedies', history: [] }, catalog: [] } : { ok: true, summary: 'Device accepted pause key; playback not verified.' } });
  });
  await page.routeWebSocket('**/api/voice', connection => {
    socket = connection;
    connection.onMessage(message => {
      if (typeof message !== 'string') return;
      const event = JSON.parse(message);
      if (event.type === 'start') { started = event; connection.send(JSON.stringify({ ready: true })); }
      if (event.type === 'action-result') results.push(event);
    });
  });
  await page.goto('/'); await page.locator('#room-button').click(); await page.locator('#movie-night').click(); await page.locator('#cinema-tv-controls').click();
  await page.getByLabel('Owner bridge key').fill('never-send-this-to-ai'); await page.getByRole('button', { name: 'Unlock this session' }).click();
  await expect(page.locator('#tv-status')).toContainText('Unlocked'); await page.keyboard.press('Escape');
  await page.locator('#talk-button').click(); await page.locator('#cozy-voice').click(); await page.locator('#start-live-home').click();
  await expect.poll(() => Boolean(started)).toBe(true);
  expect(started.context.viewer.preferences).toBe('Short comedies');
  expect(JSON.stringify(started)).not.toContain('never-send-this-to-ai');
  socket.send(JSON.stringify({ hearthAction: { action: 'tv-pause', toolUseId: 'pause-test' } }));
  await expect(page.locator('#tv-confirmation')).toBeVisible();
  await expect.poll(() => results.length).toBe(1);
  expect(JSON.stringify(results[0])).toContain('NO TV command has run');
  expect(commands.some(command => command.action === 'pause')).toBe(false);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('#tv-confirmation')).toContainText('playback not verified');
  await expect(page.getByRole('button', { name: 'End conversation', exact: true })).toBeVisible();
  expect(commands.filter(command => command.action === 'pause')).toHaveLength(1);
});

test('movie night is locked by default and failed unlock never pretends a TV is connected', async ({ page }) => {
  await page.route('**/api/tv', route => route.fulfill({ status: 403, json: { error: 'TV control is locked, disabled, or expired.' } }));
  await page.goto('/'); await page.locator('#room-button').click(); await page.locator('#movie-night').click(); await page.locator('#cinema-tv-controls').click();
  await expect(page.locator('#tv-status')).toContainText('locked');
  await expect(page.getByRole('button', { name: 'Open Prime Video', exact: true })).toHaveCount(0);
  await page.getByLabel('Owner bridge key').fill('incorrect'); await page.getByRole('button', { name: 'Unlock this session' }).click();
  await expect(page.locator('#tv-status')).toContainText('expired');
  await expect(page.getByLabel('Owner bridge key')).toHaveValue('');
});

test('TV navigation runs only after confirmation and saved preferences are explicit', async ({ page }) => {
  const commands = []; let preferences = '';
  await page.route('**/api/tv', async route => {
    const { command } = route.request().postDataJSON(); commands.push(command);
    if (command.action === 'preferences') preferences = command.text;
    await route.fulfill({ json: command.action === 'profile' ? { ok: true, profile: { preferences, history: [] }, catalog: [{ id: 'B000000001', title: 'Test catalog title', genres: 'Comedy', minutes: 24 }] } : { ok: true, summary: command.action === 'preferences' ? 'Viewing preferences saved.' : 'Device accepted the request. Playback is not verified.' } });
  });
  await page.goto('/'); await page.locator('#room-button').click(); await page.locator('#movie-night').click(); await page.locator('#cinema-tv-controls').click();
  await page.getByLabel('Owner bridge key').fill('test-key'); await page.getByRole('button', { name: 'Unlock this session' }).click();
  await page.getByRole('button', { name: 'Open Prime Video', exact: true }).click();
  await expect(page.locator('#tv-confirmation')).toContainText('Nothing has happened');
  expect(commands.some(command => command.action === 'prime')).toBe(false);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(commands.some(command => command.action === 'prime')).toBe(false);
  await page.getByRole('button', { name: 'Open Prime Video', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('#tv-confirmation')).toContainText('not verified');
  expect(commands.filter(command => command.action === 'prime')).toHaveLength(1);
  await page.getByLabel('What makes a good watch', { exact: false }).fill('Short comedies, no gore.');
  expect(preferences).toBe('');
  await page.getByRole('button', { name: 'Save my viewing preferences' }).click();
  await expect(page.locator('#tv-status')).toContainText('saved');
  expect(preferences).toBe('Short comedies, no gore.');
  await page.reload(); await page.locator('#room-button').click(); await page.locator('#movie-night').click(); await page.locator('#cinema-tv-controls').click();
  await expect(page.locator('#tv-status')).toContainText('locked');
});
