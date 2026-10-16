import { chromium } from '@playwright/test';
import { WORLD_ACTIONS, ACTIVITY_ACTIONS } from '../public/actions.js';

const origin = process.env.HEARTH_TEST_ORIGIN || 'http://127.0.0.1:3000';
const action = process.env.HEARTH_EXPECT_ACTION || 'dance';
if (!WORLD_ACTIONS.includes(action)) throw new Error('Unsupported expected action.');
if (!process.env.HEARTH_TEST_WAV) throw new Error('Set HEARTH_TEST_WAV to a synthesized microphone WAV file.');
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${process.env.HEARTH_TEST_WAV}`] });
const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1920, height: 1080 } });
try {
  const television = await context.newPage();
  await television.goto(origin);
  await television.waitForFunction(() => document.querySelector('#voice-hint')?.textContent.includes('Hands-free'));
  await television.locator('#talk-button').click();
  await television.locator('#cozy-voice').click();
  await television.locator('#voice-mode').selectOption('ambient');
  await television.getByRole('button', { name: 'Use your phone as microphone', exact: true }).click();
  const link = television.getByRole('link', { name: 'Open phone microphone' });
  await link.waitFor();
  const phone = await context.newPage();
  let actionSeen = false; let responseBytes = 0;
  phone.on('websocket', socket => socket.on('framereceived', frame => {
    try {
      const event = JSON.parse(frame.payload);
      if (event.hearthAction?.action === action) actionSeen = true;
      if (actionSeen && event.audioOutput) responseBytes += Buffer.from(event.audioOutput.content, 'base64').length;
    } catch {}
  }));
  await phone.goto(await link.getAttribute('href'));
  await phone.locator('#phone-start').waitFor();
  await television.locator('#pair-home').click();
  await phone.locator('#phone-start').click();
  await television.waitForFunction(({ action, activity }) => activity ? Boolean(document.querySelector('#companion-activity')) : document.querySelector('#pip')?.dataset.action === action, { action, activity: ACTIVITY_ACTIONS.includes(action) }, { timeout: 45000 });
  const deadline = Date.now() + 30000;
  while (responseBytes < 12000 && Date.now() < deadline) await television.waitForTimeout(100);
  if (responseBytes < 12000) throw new Error('The action appeared, but spoken response audio was not received.');
  await television.screenshot({ path: `artifacts/hearth-ambient-phone-${action}.png` });
  console.log(`Real phone pairing passed: phone PCM → Transcribe → Jev → Sonic → visible TV ${action} + ${responseBytes} spoken response bytes.`);
  await television.getByRole('button', { name: 'End phone conversation' }).click();
} finally { await browser.close(); }
