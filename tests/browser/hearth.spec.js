import { test, expect } from '@playwright/test';

test('voice renewal keeps the microphone, recent conversation and pause state without ending pairing', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await context.route('**/api/config', route => route.fulfill({ json: { dialogue: 'story', voice: 'nova-sonic', attention: 'jev' } }));
  const starts = []; let currentSocket; let paused = false;
  await context.routeWebSocket('**/api/voice', socket => {
    currentSocket = socket;
    socket.onMessage(message => {
      if (typeof message !== 'string') return;
      const input = JSON.parse(message);
      if (input.type === 'start') { starts.push(input); socket.send(JSON.stringify({ ready: true })); }
      if (input.type === 'pause') paused = input.paused;
    });
  });
  await page.goto('/'); await expect(page.locator('#voice-hint')).toContainText('Hands-free');
  await page.locator('#talk-button').click(); await page.locator('#cozy-voice').click();
  await page.getByRole('button', { name: 'Use your phone as microphone', exact: true }).click();
  const link = page.getByRole('link', { name: 'Open phone microphone' }); await expect(link).toBeVisible();
  const phone = await context.newPage(); await phone.goto(await link.getAttribute('href'));
  await expect(phone.locator('#pair-status')).toContainText('Connected to your television');
  await phone.locator('#phone-start').click(); await expect.poll(() => starts.length).toBe(1);
  currentSocket.send(JSON.stringify({ acceptedUtterance: { text: 'I love your little home.' } }));
  await phone.locator('#phone-mute').click(); await expect.poll(() => paused).toBe(true);
  paused = false;
  currentSocket.close({ code: 1012, reason: 'Renewing voice stream' });
  await expect.poll(() => starts.length).toBe(2);
  expect(starts[1].context.recentConversation).toContainEqual({ role: 'user', text: 'I love your little home.' });
  await expect.poll(() => paused).toBe(true);
  await expect(phone.locator('#phone-mute')).toBeVisible();
  await expect(page.locator('#pair-status')).not.toContainText('Pairing ended');
  await phone.locator('#phone-end').click();
  await page.waitForTimeout(1500);
  expect(starts.length).toBe(2);
});

test('ambient phone pairing preserves quiet room speech and forwards accepted turns and pause', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await context.route('**/api/config', route => route.fulfill({ json: { dialogue: 'story', voice: 'nova-sonic', attention: 'jev' } }));
  let voiceSocket; let mode; let paused = false; let acknowledged = false;
  await context.routeWebSocket('**/api/voice', socket => {
    voiceSocket = socket;
    socket.onMessage(message => {
      if (typeof message !== 'string') return;
      const input = JSON.parse(message);
      if (input.type === 'start') { mode = input.mode; socket.send(JSON.stringify({ ready: true })); }
      if (input.type === 'pause') paused = input.paused;
      if (input.type === 'action-result') acknowledged = input.ok;
    });
  });
  await page.goto('/');
  await expect(page.locator('#voice-hint')).toContainText('Hands-free');
  await page.locator('#talk-button').click(); await page.locator('#cozy-voice').click();
  await expect(page.locator('#voice-mode')).toHaveValue('ambient');
  await page.getByRole('button', { name: 'Use your phone as microphone', exact: true }).click();
  const link = page.getByRole('link', { name: 'Open phone microphone' }); await expect(link).toBeVisible();
  const phone = await context.newPage(); await phone.goto(await link.getAttribute('href'));
  await expect(phone.locator('#pair-status')).toContainText('Connected to your television');
  await phone.locator('#phone-start').click(); await expect.poll(() => mode).toBe('ambient');
  await page.locator('#pair-home').click();
  voiceSocket.send(JSON.stringify({ hearthAction: { action: 'dance', toolUseId: 'ambient-dance' } }));
  await expect(page.locator('#pip')).toHaveAttribute('data-action', 'dance');
  await expect.poll(() => acknowledged).toBe(true);
  voiceSocket.send(JSON.stringify({ attention: { accepted: false, reason: 'side-conversation' } }));
  voiceSocket.send(JSON.stringify({ contentStart: { contentName: 'silence', role: 'USER' } }));
  await expect(page.locator('#live-status')).toContainText('room conversation');
  await expect(page.locator('#pip')).toHaveAttribute('data-action', 'dance');
  voiceSocket.send(JSON.stringify({ acceptedUtterance: { text: 'Could we sit together?' } }));
  await expect(page.locator('#pip')).toHaveAttribute('data-presence', 'listening');
  await expect(page.locator('#pip')).not.toHaveAttribute('data-action', 'dance');
  await phone.locator('#phone-mute').click(); await expect.poll(() => paused).toBe(true);
  await phone.locator('#phone-mute').click(); await expect.poll(() => paused).toBe(false);
  await page.getByRole('button', { name: 'End phone conversation' }).click();
  await expect(phone.locator('#pair-status')).toContainText('Pairing ended');
});

test('Pip dances with working encore and optional original music controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('#room-button').click();
  await page.locator('#dance-with-pip').click();
  await expect(page.locator('#panel')).not.toBeVisible();
  await expect(page.locator('#pip')).toHaveAttribute('data-action', 'dance');
  await expect(page.locator('#dialogue')).toContainText('fireside shuffle');
  await page.getByRole('button', { name: 'Play our little tune', exact: true }).click();
  await expect(page.locator('#pip')).toHaveAttribute('data-action', 'dance');
  await page.getByRole('button', { name: 'Let’s sit together', exact: true }).click();
  await expect(page.locator('#pip')).not.toHaveAttribute('data-action', 'dance');
});

test('start-in-home keeps Pip visible, and speaking interrupts a playful pose', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.route('**/api/config', route => route.fulfill({ json: { dialogue: 'story', voice: 'nova-sonic' } }));
  let voiceSocket;
  await page.routeWebSocket('**/api/voice', socket => {
    voiceSocket = socket;
    socket.onMessage(message => {
      if (typeof message !== 'string' || JSON.parse(message).type !== 'start') return;
      socket.send(JSON.stringify({ ready: true })); socket.send(JSON.stringify({ hearthAction: { action: 'dance', toolUseId: 'home-dance' } }));
    });
  });
  await page.goto('/'); await page.locator('#talk-button').click(); await page.locator('#cozy-voice').click(); await page.locator('#start-live-home').click();
  await expect(page.locator('#panel')).not.toBeVisible();
  await expect(page.locator('#live-status')).toBeVisible();
  await expect(page.locator('#pip')).toHaveAttribute('data-action', 'dance');
  voiceSocket.send(JSON.stringify({ contentStart: { contentName: 'interruption', role: 'USER' } }));
  await expect(page.locator('#pip')).not.toHaveAttribute('data-action', 'dance');
  await expect(page.locator('#pip')).toHaveAttribute('data-presence', 'listening');
  await page.getByRole('button', { name: 'End conversation', exact: true }).click();
});

test('Nova Sonic can perform a real visible action and receive its acknowledgment', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.route('**/api/config', route => route.fulfill({ json: { dialogue: 'story', voice: 'nova-sonic' } }));
  let acknowledged = false;
  await page.routeWebSocket('**/api/voice', socket => {
    socket.onMessage(message => {
      if (typeof message !== 'string') return;
      const input = JSON.parse(message);
      if (input.type === 'start') { socket.send(JSON.stringify({ ready: true })); socket.send(JSON.stringify({ hearthAction: { action: 'dance', toolUseId: 'real-dance' } })); }
      if (input.type === 'action-result') acknowledged = input.toolUseId === 'real-dance' && input.ok;
    });
  });
  await page.goto('/');
  await page.locator('#talk-button').click(); await page.locator('#cozy-voice').click(); await page.locator('#start-live').click();
  await expect(page.locator('#pip')).toHaveAttribute('data-action', 'dance');
  await expect.poll(() => acknowledged).toBe(true);
  await page.locator('#show-voice-home').click();
  await expect(page.locator('#pip')).toHaveAttribute('data-action', 'dance');
  await page.getByRole('button', { name: 'End conversation', exact: true }).click();
  await expect(page.locator('#pip')).not.toHaveAttribute('data-action', 'dance');
});

test('Pip offers one silent invitation without stealing focus, and quiet means quiet', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('#pip').waitFor();
  await page.locator('#talk-button').focus();
  await page.clock.runFor(91000);
  await expect(page.locator('#pip-invitation')).toContainText('packets of seeds');
  await expect(page.locator('#talk-button')).toBeFocused();
  await page.getByRole('button', { name: 'Just enjoy the quiet', exact: true }).click();
  await page.clock.runFor(180000);
  await expect(page.locator('#pip-invitation')).toHaveCount(0);
});

test('gentle invitations can be switched off and the preference survives a return visit', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('#settings-button').click();
  await page.locator('#invitation-input').uncheck();
  await page.locator('#save-settings').click();
  await page.reload();
  await page.locator('#pip').waitFor();
  await page.clock.runFor(91000);
  await expect(page.locator('#pip-invitation')).toHaveCount(0);
  await page.locator('#settings-button').click();
  await expect(page.locator('#invitation-input')).not.toBeChecked();
});

test('phone pairing joins privately and relays captions into the TV home', async ({ page, context }) => {
  await context.route('**/api/config', route => route.fulfill({ json: { dialogue: 'story', voice: 'nova-sonic' } }));
  await context.grantPermissions(['microphone']);
  await context.routeWebSocket('**/api/voice', socket => {
    socket.onMessage(message => {
      if (typeof message !== 'string' || JSON.parse(message).type !== 'start') return;
      socket.send(JSON.stringify({ ready: true }));
      socket.send(JSON.stringify({ contentStart: { contentName: 'paired', role: 'ASSISTANT', additionalModelFields: '{"generationStage":"FINAL"}' } }));
      socket.send(JSON.stringify({ textOutput: { contentName: 'paired', content: 'Your voice belongs in our little home.' } }));
      socket.send(JSON.stringify({ contentEnd: { contentName: 'paired' } }));
      socket.send(JSON.stringify({ hearthAction: { action: 'wave', toolUseId: 'paired-wave' } }));
    });
  });
  await page.goto('/');
  await page.locator('#talk-button').click();
  await page.locator('#cozy-voice').click();
  await page.getByRole('button', { name: 'Use your phone as microphone', exact: true }).click();
  const link = page.getByRole('link', { name: 'Open phone microphone' });
  await expect(link).toBeVisible();
  const phone = await context.newPage();
  await phone.goto(await link.getAttribute('href'));
  await expect(phone.locator('#pair-status')).toContainText('Connected to your television');
  await phone.locator('#phone-start').click();
  await expect(page.locator('#dialogue')).toContainText('Your voice belongs');
  await expect(page.locator('#pip')).toHaveAttribute('data-action', 'wave');
  await page.locator('#pair-home').click();
  await expect(page.locator('#live-status')).toBeVisible();
  await page.getByRole('button', { name: 'End phone conversation' }).click();
  await expect(phone.locator('#pair-status')).toContainText('Pairing ended');
  await expect(page.locator('#live-status')).toHaveCount(0);
});

test('the recital story persists across reload and changes the world', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'My granddaughter has a recital', exact: true }).click();
  await page.reload();
  await expect(page.locator('#dialogue')).toContainText('How did it go?');
  await page.getByRole('button', { name: 'She was wonderful', exact: true }).click();
  await expect(page.locator('#memory-picture')).toHaveAttribute('visibility', 'visible');
  await page.getByRole('button', { name: 'I wish we talked more', exact: true }).click();
  await expect(page.locator('#pip')).toHaveClass(/pip-thoughtful/);
  await page.getByRole('button', { name: 'Help me write to her', exact: true }).click();
  await expect(page.locator('#message-text')).toContainText('recital');
  await page.getByRole('button', { name: 'We’ve arranged a call', exact: true }).click();
  await page.getByRole('button', { name: 'Visit tomorrow (demo)', exact: true }).click();
  await expect(page.locator('#dialogue')).toContainText('How did your time with your granddaughter go?');
  await page.reload();
  await expect(page.locator('#memory-picture')).toHaveAttribute('visibility', 'visible');
  expect(errors).toEqual([]);
});

test('forgetting a memory clears its related world change', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'My granddaughter has a recital', exact: true }).click();
  await page.getByRole('button', { name: 'She was wonderful', exact: true }).click();
  await page.locator('#memories-button').click();
  await page.locator('[data-forget="recital"]').click();
  await expect(page.locator('#memory-picture')).toHaveAttribute('visibility', 'hidden');
  await expect(page.locator('.memory')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.reload();
  await expect(page.locator('#dialogue')).not.toContainText('How did it go?');
});

test('Room Mode gives both players a turn at all three questions', async ({ page }) => {
  await page.goto('/');
  await page.locator('#room-button').click();
  await page.getByRole('button', { name: 'Room Mode · 2 people', exact: true }).click();
  for (let round = 0; round < 3; round++) {
    for (let player = 1; player <= 2; player++) {
      await expect(page.locator('#panel-kicker')).toContainText(`PLAYER ${player}`);
      await page.locator(`[data-answer="${round === 1 ? 1 : 0}"]`).click();
      await page.getByRole('button', { name: 'Continue →', exact: true }).click();
    }
  }
  await expect(page.locator('#panel-content')).toContainText('Player 1 found 3 answers. Player 2 found 3.');
});

test('guided demo advances six moments with real local memory', async ({ page }) => {
  await page.goto('/');
  for (let step = 0; step < 6; step++) {
    await page.locator('#demo-button').click();
    await expect(page.locator('#panel-kicker')).toContainText(`${step + 1} / 6`);
    await page.locator('#play-step').click();
    if (step === 4) await page.getByRole('button', { name: 'We’ve arranged a call', exact: true }).click();
  }
  await expect(page.locator('#dialogue')).toContainText('How did your time');
  await expect(page.locator('#day-count')).toContainText('Day 3');
});

test('remote navigation stays in dialogs and back restores focus', async ({ page }) => {
  await page.goto('/?tv=1');
  await page.locator('#room-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#shared-game')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#room-button')).toBeFocused();
});

test('memory opt-out and confirmed reset work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#remember-input').uncheck();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.getByRole('button', { name: 'My granddaughter has a recital', exact: true }).click();
  await page.locator('#memories-button').click();
  await expect(page.locator('.memory')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Clear my memories', exact: true }).click();
  await page.getByRole('button', { name: 'Clear everything', exact: true }).click();
  await expect(page.locator('#day-count')).toContainText('Your first day');
});

test('mobile layout fits without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#pip')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('TV layouts fit 1080p and compact WebView viewports', async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 960, height: 540 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/?tv=1');
    await page.locator('#pip').waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  }
});

test('connected dialogue is opt-in and proposed memories require confirmation', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { dialogue: 'bedrock' } }));
  await page.route('**/api/dialogue', route => route.fulfill({ json: { text: 'Your garden sounds lovely. What grows there?', mood: 'attentive', action: 'none', memory: 'You enjoy growing roses in your garden.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#connected-input').check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.locator('#talk-button').click();
  await page.locator('#talk-text').fill('I grow roses in my garden');
  await page.getByRole('button', { name: 'Tell Pip', exact: true }).click();
  await expect(page.locator('#dialogue')).toContainText('Your garden sounds lovely');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hearth.home.v1')).memories.length)).toBe(0);
  await page.getByRole('button', { name: 'Remember this moment', exact: true }).click();
  await page.getByRole('button', { name: 'Keep this memory', exact: true }).click();
  await page.locator('#memories-button').click();
  await expect(page.locator('.memory')).toContainText('growing roses');
});

test('a failed AI request falls back to a working story', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { dialogue: 'bedrock' } }));
  await page.route('**/api/dialogue', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#connected-input').check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.locator('#talk-button').click();
  await page.locator('#talk-text').fill('The house is quiet');
  await page.getByRole('button', { name: 'Tell Pip', exact: true }).click();
  await expect(page.locator('#dialogue')).toContainText('missing having someone around');
  await expect(page.locator('#talk-button')).toBeEnabled();
});

test('garden choices persist and change the scene', async ({ page }) => {
  await page.goto('/');
  await page.locator('#room-button').click();
  await page.locator('#garden-button').click();
  await page.locator('#plant-moonflowers').click();
  await expect(page.locator('#moonflowers')).toHaveAttribute('visibility', 'visible');
  await page.reload();
  await expect(page.locator('#moonflowers')).toHaveAttribute('visibility', 'visible');
  await page.locator('#memories-button').click();
  await expect(page.locator('.memory')).toContainText('moonflowers');
});

test('the lantern story branches and leaves a persistent light in the world', async ({ page }) => {
  await page.goto('/');
  await page.locator('#room-button').click();
  await page.locator('#story-button').click();
  await page.locator('[data-story="stream"]').click();
  await expect(page.locator('#panel-content')).toContainText('Beside the stream');
  await page.locator('[data-story="seed"]').click();
  await expect(page.locator('#panel-content')).toContainText('We plant the silver seed');
  await page.locator('#story-finish').click();
  await expect(page.locator('#story-lantern')).toHaveAttribute('visibility', 'visible');
  await page.reload();
  await expect(page.locator('#story-lantern')).toHaveAttribute('visibility', 'visible');
});

test('weather choices persist and animate the window', async ({ page }) => {
  await page.goto('/');
  await page.locator('#room-button').click();
  await page.locator('#atmosphere-button').click();
  await page.locator('[data-atmosphere="rain"]').click();
  await expect(page.locator('.world')).toHaveAttribute('data-atmosphere', 'rain');
  await page.reload();
  await expect(page.locator('#world-time')).toHaveText('RAIN AT THE WINDOW');
});

test('quiet breathing can end without a lingering timer', async ({ page }) => {
  await page.goto('/');
  await page.locator('#room-button').click();
  await page.locator('#breathe-button').click();
  await expect(page.locator('#breathing-light')).toBeVisible();
  await page.locator('#end-breathing').click();
  await expect(page.locator('#panel')).not.toBeVisible();
  await expect(page.locator('#dialogue')).toContainText('We don’t have to fill every moment');
});

test('live voice is an explicit microphone action and can be ended', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.route('**/api/config', route => route.fulfill({ json: { dialogue: 'story', voice: 'nova-sonic' } }));
  await page.routeWebSocket('**/api/voice', socket => {
    socket.onMessage(message => {
      if (typeof message !== 'string') return;
      const event = JSON.parse(message);
      if (event.type === 'start') {
        socket.send(JSON.stringify({ ready: true }));
        socket.send(JSON.stringify({ contentStart: { contentName: 'test', role: 'ASSISTANT', additionalModelFields: '{"generationStage":"FINAL"}' } }));
        socket.send(JSON.stringify({ textOutput: { contentName: 'test', content: 'Hello. It is good to have you here.' } }));
      }
    });
  });
  await page.goto('/');
  await page.locator('#talk-button').click();
  await page.locator('#cozy-voice').click();
  await expect(page.locator('#start-live')).toBeVisible();
  await page.locator('#start-live').click();
  await expect(page.locator('#pip-caption')).toContainText('good to have you here');
  await page.locator('#show-voice-home').click();
  await expect(page.locator('#panel')).not.toBeVisible();
  await expect(page.locator('#live-status')).toBeVisible();
  await page.clock.install();
  await page.clock.runFor(26000);
  await expect(page.locator('#mood-label')).toHaveText('feeling glad you’re here');
  await page.getByRole('button', { name: 'End conversation', exact: true }).click();
  await expect(page.locator('#live-status')).toHaveCount(0);
  await expect(page.locator('.world')).not.toHaveClass(/voice-active/);
});
