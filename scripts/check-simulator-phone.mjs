import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const joinFile = process.env.HEARTH_PAIR_URL_FILE;
const microphone = process.env.HEARTH_TEST_WAV;
if (!joinFile || !microphone) throw new Error('Set HEARTH_PAIR_URL_FILE and HEARTH_TEST_WAV to private pairing and synthetic microphone fixtures.');
const join = (await readFile(joinFile, 'utf8')).trim();
const capture = process.env.HEARTH_CAPTURE_ORIGIN || 'http://127.0.0.1:19081';
const report = { runtime: 'Official Vega simulator with a Chromium phone microphone', syntheticMicrophone: true, mockedProviders: false, checks: [] };
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${microphone}%noloop`] });
const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 450, height: 900 } });
const phone = await context.newPage();
let actionId;
let acknowledged = false;
let audioBytes = 0;
let postActionAudioBytes = 0;
let audioEnded = false;
let voiceError;
const audio = [];
let cursor = 0;
let started;
phone.on('websocket', socket => {
  if (!socket.url().endsWith('/api/voice')) return;
  socket.on('framereceived', frame => {
    let event;
    try { event = JSON.parse(frame.payload.toString()); } catch { return; }
    if (event.error) voiceError = event.error;
    if (event.hearthAction?.action === 'tv-pause') actionId = event.hearthAction.toolUseId;
    if (event.audioOutput) {
      const pcm = Buffer.from(event.audioOutput.content, 'base64');
      audioBytes += pcm.length;
      if (actionId) postActionAudioBytes += pcm.length;
      if (started) {
        cursor = Math.max(cursor, Math.round((Date.now() - started) * 24) * 2);
        audio.push({ at: cursor, pcm });
        cursor += pcm.length;
      }
    }
    if (event.contentEnd?.type === 'AUDIO' && actionId && postActionAudioBytes > 12000) audioEnded = true;
  });
  socket.on('framesent', frame => {
    try {
      const event = JSON.parse(frame.payload.toString());
      if (event.type === 'action-result' && event.toolUseId === actionId && event.ok) acknowledged = true;
    } catch {}
  });
});
let failure;
try {
  await phone.goto(join);
  await phone.locator('#phone-start').waitFor();
  report.checks.push('Joined the private pairing created by the actual simulator');
  await phone.waitForFunction(() => document.querySelector('#pair-status')?.textContent.includes('Connected'));
  const recording = await fetch(`${capture}/record`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: 60 }) });
  if (!recording.ok) throw new Error('Simulator capture could not start');
  const state = await recording.json(); started = state.startedEpochMs;
  await phone.locator('#phone-discover').click();
  await expect(phone.locator('#phone-control-result')).toContainText('Vega discovered');
  report.mediaDiscovery = await phone.locator('#phone-control-result').textContent();
  await phone.locator('#phone-film-shelf [data-film="bunny"]').click();
  await expect(phone.locator('#phone-control-result')).toContainText('playing', {timeout:20000});
  report.checks.push('The paired phone launched the actual open film in the simulator TV player');
  await phone.waitForTimeout(2500);
  await phone.locator('#phone-start').click();
  const deadline = Date.now() + 40000;
  while (!(actionId && acknowledged && audioEnded) && Date.now() < deadline && !voiceError) await phone.waitForTimeout(100);
  if (voiceError) throw new Error(voiceError);
  if (!(actionId && acknowledged && postActionAudioBytes > 12000)) throw new Error(`Live simulator path incomplete: movie pause=${Boolean(actionId)}, simulator acknowledgment=${acknowledged}, response audio=${audioBytes}`);
  await expect(phone.locator('#phone-playback')).toContainText('PAUSED');
  report.checks.push('Phone PCM reached real voice inference and requested movie pause');
  report.checks.push('The actual simulator returned the successful action acknowledgment');
  const frame = await fetch(`${capture}/frame.png`);
  if (!frame.ok) throw new Error('Could not capture the simulator action');
  await writeFile('artifacts/hearth-simulator-smoke.png', Buffer.from(await frame.arrayBuffer()));
  report.checks.push(`Received ${audioBytes} bytes of real spoken response audio`);
  await phone.waitForTimeout(Math.min(10000, Math.max(2000, cursor / 48 - (Date.now() - started) + 1500)));
  await phone.locator('#phone-mute').click();
  await expect(phone.locator('#phone-mute')).toContainText('Resume');
  report.checks.push('Phone microphone paused');
  await phone.locator('#phone-play').click();await expect(phone.locator('#phone-control-result')).toContainText('PLAYING');
  report.checks.push('The paired phone resumed real simulator movie playback');
  await phone.waitForTimeout(1000);
  await phone.locator('#phone-end').click();
  report.checks.push('Phone connection ended');
  await phone.waitForTimeout(1500);
} catch (error) {
  failure = error;
  report.error = String(error.message).replaceAll(join, '[private pairing URL]').replace(/([?&]join=)[a-f0-9-]{36}/gi, '$1[redacted]');
} finally {
  if (started) {
    const stopped = await fetch(`${capture}/record/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    report.capture = await stopped.json();
  }
  await context.close(); await browser.close();
  const pcm = Buffer.alloc(Math.max(cursor, started ? Math.ceil((Date.now() - started) * 24) * 2 : 0));
  for (const part of audio) part.pcm.copy(pcm, part.at);
  await writeFile('artifacts/hearth-simulator-smoke.pcm', pcm);
  report.passed = !failure;
  await writeFile('artifacts/hearth-simulator-smoke.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (failure) process.exitCode = 1;
