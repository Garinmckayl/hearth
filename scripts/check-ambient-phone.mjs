import { chromium } from '@playwright/test';

const origin = process.env.HEARTH_TEST_ORIGIN || 'http://127.0.0.1:3000';
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
  await phone.goto(await link.getAttribute('href'));
  await phone.locator('#phone-start').waitFor();
  await television.locator('#pair-home').click();
  await phone.locator('#phone-start').click();
  await television.waitForFunction(() => document.querySelector('#pip')?.dataset.action === 'dance', { }, { timeout: 45000 });
  await television.screenshot({ path: 'artifacts/hearth-ambient-phone-dance.png' });
  console.log('Real phone pairing passed: phone PCM → Transcribe → Jev → Sonic → visible TV dance.');
  await television.getByRole('button', { name: 'End phone conversation' }).click();
} finally { await browser.close(); }
