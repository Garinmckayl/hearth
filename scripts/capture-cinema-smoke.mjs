import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const origin=process.env.HEARTH_TEST_ORIGIN || 'http://127.0.0.1:3000';
const mic=process.env.HEARTH_TEST_WAV;
if(!mic)throw new Error('HEARTH_TEST_WAV must contain the synthetic movie pause request.');
const output='artifacts/hearth-movie-night';await mkdir(output+'-raw',{recursive:true});
const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${mic}%noloop`]});
const context=await browser.newContext({permissions:['microphone'],viewport:{width:1920,height:1080},recordVideo:{dir:output+'-raw',size:{width:1920,height:1080}}});
const tv=await context.newPage();const started=Date.now();
const report={runtime:'Chromium TV and paired phone; not official Vega',mockedProviders:false,syntheticMicrophone:true,checks:[],errors:[]};
let phone,actionId,ack=false,voiceError,audioEnded=false,postActionAudio=0,cursor=0;const parts=[];
context.on('page',page=>page.on('websocket',socket=>{
  if(!socket.url().endsWith('/api/voice'))return;
  socket.on('framereceived',frame=>{let event;try{event=JSON.parse(frame.payload.toString());}catch{return;}
    if(event.error)voiceError=event.error;
    if(event.hearthAction?.action==='tv-pause')actionId=event.hearthAction.toolUseId;
    if(event.audioOutput){const pcm=Buffer.from(event.audioOutput.content,'base64');cursor=Math.max(cursor,Math.round((Date.now()-started)*24)*2);parts.push({at:cursor,pcm});cursor+=pcm.length;if(actionId)postActionAudio+=pcm.length;}
    if(event.contentEnd?.type==='AUDIO'&&postActionAudio>12000)audioEnded=true;
  });
  socket.on('framesent',frame=>{try{const e=JSON.parse(frame.payload.toString());if(e.type==='action-result'&&e.toolUseId===actionId&&e.ok&&e.summary?.includes('PAUSED'))ack=true;}catch{}});
}));
let failure;
try{
  tv.on('pageerror',error=>report.errors.push(error.message));
  await tv.goto(origin);await tv.addStyleTag({content:'#pair-link {filter:blur(18px)}'});await tv.locator('#cinema-button').click();
  await tv.locator('#cinema-mood').fill('Something funny and short, with woodland animals.');
  const reply=tv.waitForResponse(r=>r.url().endsWith('/api/movie-night'));
  await tv.locator('button[type="submit"]').filter({hasText:'Pip, choose with me'}).click();
  const recommendation=await(await reply).json();
  if(recommendation.source!=='bedrock'||!recommendation.picks.includes('bunny'))throw new Error('Live recommendation did not select the playable woodland comedy.');
  report.recommendation=recommendation;report.checks.push('Live Bedrock recommended Big Buck Bunny for the viewer’s short woodland comedy request');
  const speakRes=await fetch(`${origin}/api/speak`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({text:recommendation.text,voice:'tiffany'})});
  if(speakRes.ok){const wav=Buffer.from(await speakRes.arrayBuffer());if(wav.length>44){const pcm=wav.subarray(44);cursor=Math.max(cursor,Math.round((Date.now()-started)*24)*2);parts.push({at:cursor,pcm});cursor+=pcm.length;}}
  await tv.locator('[data-film="bunny"] button').focus();
  await tv.waitForTimeout(Math.min(12000,Math.max(5000,cursor/48-(Date.now()-started)+500)));
  await tv.locator('[data-film="bunny"] button').click();
  const video=tv.locator('#cinema-video');await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(.5);
  report.checks.push('The actual 596-second open film decoded and played in the TV player');
  await tv.locator('#cinema-pair').click();
  const join=await tv.locator('#pair-link a').getAttribute('href');phone=await context.newPage();await phone.goto(join);
  await expect(phone.locator('#phone-watch')).toBeVisible();await tv.locator('#pair-home').click();
  await phone.locator('#phone-start').click();
  const deadline=Date.now()+40000;
  while(!(actionId&&ack&&audioEnded)&&Date.now()<deadline&&!voiceError)await phone.waitForTimeout(100);
  if(voiceError)throw new Error(voiceError);
  if(!actionId||!ack)throw new Error('Live speech did not return the measured PAUSED acknowledgment from the real TV player.');
  await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(true);
  report.checks.push('Synthetic phone speech → live Nova Sonic → tv-pause → real TV player PAUSED acknowledgment');
  await tv.screenshot({path:output+'.png'});
  await phone.waitForTimeout(Math.min(12000,Math.max(2000,cursor/48-(Date.now()-started)+1000)));
  await phone.locator('#phone-mute').click();await expect(phone.locator('#phone-mute')).toContainText('Resume');
  await phone.locator('#phone-play').click();await expect(phone.locator('#phone-control-result')).toContainText('PLAYING');
  await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(false);report.checks.push('Paired phone resumed the actual film');
  await tv.waitForTimeout(2500);
  await tv.evaluate(()=>window.hearthPause());
  await expect(phone.locator('#phone-tv-state')).toContainText('background');
  const beforeBackgroundAudio=parts.reduce((n,p)=>n+p.pcm.length,0);
  await phone.locator('#phone-text').fill('Pip, tell me one sentence about why you like woodland comedies.');await phone.locator('#phone-text-form button').click();
  await expect.poll(()=>parts.reduce((n,p)=>n+p.pcm.length,0)-beforeBackgroundAudio,{timeout:20000}).toBeGreaterThan(12000);
  await phone.waitForTimeout(Math.min(12000,Math.max(4000,cursor/48-(Date.now()-started)+1000)));
  report.checks.push('After the TV background lifecycle, the SAME phone voice session returned fresh real model response audio');
  await tv.evaluate(()=>window.hearthResume());
  await phone.locator('#phone-end').click();report.checks.push('Explicit phone disconnect ended the companion session');
  await tv.waitForTimeout(1000);
}catch(error){failure=error;report.errors.push(error.message);await tv.screenshot({path:output+'-failure.png'}).catch(()=>{});}
finally{
  report.durationSeconds=(Date.now()-started)/1000;report.audioBytes=parts.reduce((n,p)=>n+p.pcm.length,0);
  await context.close();await rename(await tv.video().path(),output+'.webm');await browser.close();
  const pcm=Buffer.alloc(Math.max(cursor,Math.ceil(report.durationSeconds*24000)*2));for(const part of parts)part.pcm.copy(pcm,part.at);await writeFile(output+'.pcm',pcm);
  const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',output+'.webm','-f','s16le','-ar','24000','-ac','1','-i',output+'.pcm','-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',output+'.mp4'],{encoding:'utf8'});
  if(ff.status!==0){failure ||= new Error('Encoding failed');report.errors.push(ff.stderr);}
  report.passed=!failure;await writeFile(output+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
if(failure)process.exitCode=1;
