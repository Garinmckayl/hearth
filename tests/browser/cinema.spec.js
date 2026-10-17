import { test, expect } from '@playwright/test';

test('a real film plays, pauses, resumes and reports its measured position',async({page})=>{
  await page.goto('/');await page.locator('#cinema-button').click();
  await page.locator('[data-film="bunny"] button').click();
  const video=page.locator('#cinema-video');
  await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(.5);
  expect(await video.evaluate(v=>v.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);
  await page.locator('#cinema-pause').click();await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(true);
  const paused=await video.evaluate(v=>v.currentTime);await page.waitForTimeout(300);expect(await video.evaluate(v=>v.currentTime)).toBe(paused);
  await expect(page.locator('#cinema-caption')).toContainText('intermission');
  await page.locator('#cinema-pause').click();await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(paused+.1);
  await page.locator('#cinema-exit').click();await expect(page.locator('#cinema-stage')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hearth.cinema.v1')||'{}').history||[])).toEqual([]);
});

test('explicit movie memory remembers progress across reload and can be deleted',async({page})=>{
  await page.goto('/');await page.locator('#cinema-button').click();
  await page.locator('#cinema-mood').fill('Short comedies');await page.locator('#cinema-save').click();
  await page.locator('#cinema-remember').check();await page.locator('[data-film="bunny"] button').click();
  const video=page.locator('#cinema-video');await expect.poll(()=>video.evaluate(v=>v.readyState)).toBeGreaterThan(2);
  await video.evaluate(v=>{v.currentTime=45;v.pause();});
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hearth.cinema.v1')).history[0]?.positionSeconds)).toBe(45);
  await page.reload();await page.locator('#cinema-button').click();await expect(page.locator('#cinema-mood')).toHaveValue('Short comedies');
  await page.locator('[data-film="bunny"] button').click();await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(44);
  await page.locator('#cinema-exit').click();await page.locator('#cinema-button').click();await page.locator('#cinema-forget').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hearth.cinema.v1')))).toEqual({preferences:'',history:[],rememberProgress:false});
});

test('paired phone controls the real TV player and survives closing the TV page',async({page,context})=>{
  await page.goto('/');await page.locator('#cinema-button').click();await page.locator('[data-film="bunny"] button').click();
  await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(.2);
  await page.locator('#cinema-pair').click();
  const join=await page.locator('#pair-link a').getAttribute('href');
  const phone=await context.newPage();await phone.goto(join);
  await expect(phone.locator('#phone-watch')).toBeVisible();
  await page.locator('#pair-home').click();
  await phone.locator('#phone-pause').click();await expect(phone.locator('#phone-control-result')).toContainText('PAUSED');
  await expect.poll(()=>page.locator('video').evaluate(v=>v.paused)).toBe(true);
  await phone.locator('#phone-play').click();await expect(phone.locator('#phone-control-result')).toContainText('PLAYING');
  await expect.poll(()=>page.locator('video').evaluate(v=>v.paused)).toBe(false);
  await page.close();await expect(phone.locator('#phone-tv-state')).toContainText('background');
  await phone.locator('#phone-pause').click();await expect(phone.locator('#phone-control-result')).toContainText('cannot accept background controls');
  await phone.locator('#phone-end').click();await phone.close();
});
