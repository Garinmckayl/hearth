import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const origin = process.env.HEARTH_TEST_ORIGIN || 'http://127.0.0.1:3000';
const microphone = process.env.HEARTH_TEST_WAV;
if (!microphone) throw new Error('HEARTH_TEST_WAV must point to a synthetic microphone WAV.');
const output = 'artifacts/hearth-browser-smoke';
await mkdir(`${output}-raw`, { recursive: true });
const browser = await chromium.launch({ args: [
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${microphone}%noloop`,
] });
const context = await browser.newContext({
  permissions: ['microphone'], viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: `${output}-raw`, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const started = Date.now();
const report = { runtime: 'Chromium browser, not official Vega simulator', syntheticMicrophone: true, mockedProviders: false, checks: [], errors: [] };
const audio = [];
let cursor = 0;
let action = false;
let acknowledged = false;
let audioBytes = 0;
let audioEnded = false;
let voiceError;
page.on('pageerror', error => report.errors.push(error.message));
page.on('websocket', socket => {
  if (!socket.url().endsWith('/api/voice')) return;
  socket.on('framereceived', frame => {
    let event;
    try { event = JSON.parse(frame.payload.toString()); } catch { return; }
    if (event.error) voiceError = event.error;
    if (event.hearthAction?.action === 'dance') action = true;
    if (event.audioOutput) {
      const pcm = Buffer.from(event.audioOutput.content, 'base64');
      const at = Math.round((Date.now() - started) * 24) * 2;
      cursor = Math.max(cursor, at);
      audio.push({ at: cursor, pcm });
      cursor += pcm.length;
      audioBytes += pcm.length;
    }
    if (event.contentEnd?.type === 'AUDIO' && action && audioBytes > 12000) audioEnded = true;
  });
  socket.on('framesent', frame => {
    try {
      const event = JSON.parse(frame.payload.toString());
      if (event.type === 'action-result' && event.ok) acknowledged = true;
    } catch {}
  });
});
let failure;
try {
  await page.goto(`${origin}/?tv=1`);
  await page.locator('#pip').waitFor();
  await page.evaluate(() => {
    const badge = document.createElement('div');
    badge.textContent = 'LOCAL BROWSER CHECK · LIVE NOVA SONIC · SYNTHETIC MICROPHONE';
    Object.assign(badge.style, { position: 'fixed', left: '18px', bottom: '10px', zIndex: '9999', padding: '8px 12px', borderRadius: '8px', background: '#111d', color: '#fff', font: '14px sans-serif', pointerEvents: 'none' });
    document.body.append(badge);
  });
  report.checks.push('Current home rendered');
  await page.waitForTimeout(1500);
  await page.locator('#vibe-switch').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.world')).toHaveAttribute('data-vibe', 'cold');
  report.checks.push('Keyboard selection switched to cold');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await expect(page.locator('.world')).toHaveAttribute('data-vibe', 'cozy');
  await page.locator('#talk-button').click();
  await page.locator('#cozy-voice').click();
  if (await page.locator('#voice-mode').count()) await page.locator('#voice-mode').selectOption('conversation');
  await page.locator('#start-live-home').click();
  const deadline = Date.now() + 45000;
  while (!(action && acknowledged && audioEnded) && Date.now() < deadline && !voiceError) await page.waitForTimeout(100);
  if (voiceError) throw new Error(voiceError);
  if (!(action && acknowledged && audioBytes > 12000)) throw new Error(`Live voice incomplete: dance=${action}, actual browser acknowledgment=${acknowledged}, audio=${audioBytes}`);
  report.checks.push('Synthetic microphone → real Nova Sonic → dance tool → real browser action acknowledgment');
  report.checks.push(`Received ${audioBytes} bytes of real response audio`);
  await page.screenshot({ path: `${output}.png` });
  await page.waitForTimeout(Math.min(8000, Math.max(1000, cursor / 48 - (Date.now() - started) + 1000)));
  const pause = page.getByRole('button', { name: 'Pause microphone', exact: true });
  await pause.click();
  await expect(page.getByRole('button', { name: 'Resume microphone', exact: true })).toBeVisible();
  report.checks.push('Microphone pause');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'End conversation', exact: true }).click();
  await expect(page.locator('#live-status')).toHaveCount(0);
  report.checks.push('Conversation ended and live status removed');
  await page.waitForTimeout(1000);
} catch (error) {
  failure = error;
  report.errors.push(error.message);
  await page.screenshot({ path: `${output}-failure.png` });
} finally {
  report.durationSeconds = (Date.now() - started) / 1000;
  await context.close();
  await rename(await page.video().path(), `${output}.webm`);
  await browser.close();
  const pcm = Buffer.alloc(Math.max(cursor, Math.ceil(report.durationSeconds * 24000) * 2));
  for (const chunk of audio) chunk.pcm.copy(pcm, chunk.at);
  await writeFile(`${output}.pcm`, pcm);
  const encoded = spawnSync('ffmpeg', ['-y', '-i', `${output}.webm`, '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', `${output}.pcm`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', `${output}.mp4`], { encoding: 'utf8' });
  if (encoded.status !== 0) { report.errors.push(encoded.stderr.slice(-1500)); failure ||= new Error('Video encoding failed'); }
  report.passed = !failure;
  await writeFile(`${output}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (failure) process.exitCode = 1;
