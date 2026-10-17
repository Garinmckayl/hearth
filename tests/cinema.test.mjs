import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile, unlink } from 'node:fs/promises';
import { createServer } from '../server.mjs';
import { rankFilms, primeSearch } from '../public/film-catalog.js';
import { validateMovieInput, validateMovieReply } from '../lib/movie-night.mjs';

test('movie recommendations distinguish playable films, trailers and Prime searches',()=>{
  const picks=rankFilms('funny woodland short comedy',{playableOnly:true});
  assert.equal(picks[0].id,'bunny');
  assert.equal(picks.some(film=>film.kind==='search'),false);
  assert.equal(rankFilms('dragon fantasy')[0].kind,'trailer');
  assert.equal(new URL(primeSearch('A & B')).searchParams.get('phrase'),'A & B');
  assert.deepEqual(validateMovieReply('{"text":"Try the rabbit.","picks":["invented-prime-id","bunny","bunny"]}').picks,['bunny']);
  const input=validateMovieInput({text:'Tell me about this film',playback:{id:'paddington',status:'PLAYING',positionSeconds:10}});
  assert.equal(input.playback,null,'Prime search is not measured playback');
  assert.throws(()=>validateMovieInput({text:''}));
});

test('movie API uses bounded context and the shared same-origin controls',async()=>{
  let received;
  const server=createServer({connected:true,movieDialogue:async input=>{received=input;return {text:'A woodland comedy.',picks:['bunny']};}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    const options={method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({text:'Choose a film',preferences:'Short comedies',playback:{id:'bunny',status:'PAUSED',positionSeconds:12},history:[{id:'unknown',completed:true}]})};
    assert.equal((await fetch(origin+'/api/movie-night',options)).status,200);
    assert.equal(received.playback.positionSeconds,12);assert.deepEqual(received.history,[]);
    assert.equal((await fetch(origin+'/api/movie-night',{...options,headers:{...options.headers,Origin:'https://other.example'}})).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('film serving supports suffix and byte ranges without buffering entire movies',async()=>{
  const file='public/cinema-range-test.mp4';await writeFile(file,Buffer.from('0123456789'));
  const server=createServer({connected:false});server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}/cinema-range-test.mp4`;
  try {
    const response=await fetch(url,{headers:{Range:'bytes=2-4'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 2-4/10');assert.equal(await response.text(),'234');
    assert.equal(await (await fetch(url,{headers:{Range:'bytes=-2'}})).text(),'89');
    assert.equal((await fetch(url,{headers:{Range:'bytes=10-'}})).status,416);
  }finally{await new Promise(resolve=>server.close(resolve));await unlink(file);}
});
