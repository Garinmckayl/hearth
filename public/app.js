import { STORAGE_KEY, freshState, loadState, remember, forget, hasMemory, replyFor } from './state.js';
import { RealtimeVoice } from './voice.js';
import { PhonePairing } from './pairing.js';
import { invitationFor } from './invitations.js';
import { CharacterActions, validateWorldAction, WORLD_ACTIONS, ACTIVITY_ACTIONS } from './actions.js';
import { CompanionActivities } from './activities.js';
import { applyAmbience } from './ambience.js';
import { FiresideTune } from './music.js';
import { MovieNight, TV_ACTIONS } from './movie-night.js';
import { Cinema } from './cinema.js';
import { FILMS, filmById } from './film-catalog.js';

const element = id => document.getElementById(id);
let storage;
try { storage = window.localStorage; } catch { storage = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } }; }
let state = loadState(storage);
let demoStep = -1;
let idleTimer;
let invitationTimer;
let invitationShown = false;
let toastTimer;
let recognition;
let listening = false;
let lastFocus;
let gameRound = 0;
let player = 1;
let scores = [0, 0];
let roomPlayers = 1;
let backendAvailable = false;
let requestController;
let history = [];
let pendingMemory;
let pip;
let characterActions;
const firesideTune = new FiresideTune();
let sonicAvailable = false;
let attentionAvailable = false;
let liveVoice;
let voiceTranscript = '';
let phonePairing;
let breathTimer;
let storyAudio;
let speechRequest;
let keepVoiceOnClose = false;
let speechAllowed = false;
let lastMoviePick = null;
let configReady;
const backendUrl = window.HearthNative?.backendUrl() || '';
const movieNight = new MovieNight({ backendUrl, openPanel: (kicker, html) => openPanel(kicker, html, true), mount: document.querySelector('.world'), onForget: () => { history = []; stopLiveVoice(); }, onTurn: text => liveVoice ? liveVoice.submitText(text) : phonePairing?.userText(text) || false });
const cinema = new Cinema({backendUrl, mount:document.querySelector('.world'), openPanel:(kicker,html)=>openPanel(kicker,html,true), onTurn:text=>liveVoice?.submitText(text) || phonePairing?.userText(text), onSpeak:text=>{speechAllowed=true;speak(text,{force:true});}, onPick:pick=>{lastMoviePick=pick;phonePairing?.moviePick(pick);}, onPlayback:playback=>phonePairing?.playback(playback), onPair:()=>pairPhone('conversation',true), onTvControls:()=>movieNight.show(), onForget:()=>{history=[];stopLiveVoice();}, onClose:()=>element('cinema-button').focus(), onPrime:async (film,url)=>{
  if (window.HearthNative?.tvControl) return window.HearthNative.tvControl(film.id === 'prime' ? {action:'prime'} : {action:'prime-search',text:film.title});
  if (movieNight.token) return movieNight.request(film.id === 'prime' ? {action:'prime'} : {action:'prime-search',text:film.title});
  window.open(url,'_blank','noopener');
  return {ok:true, summary:'Requested a Prime Video search in a separate tab. Check the opened tab; availability and playback are not confirmed.'};
}});
function viewerContext() { const control = movieNight.context(state.remember); const watching = cinema.context(state.remember); return {...watching, ...control, catalog:[...watching.catalog,...control.catalog].slice(0,25), preferences:[watching.preferences,control.preferences].filter(Boolean).join('; '), history:[...(watching.history || []),...(control.history || [])].slice(-8), playback:watching.playback}; }
const companionActivities = new CompanionActivities({ mount: document.querySelector('.world'), onGesture: action => performWorldAction({ action }), onTurn: text => liveVoice ? liveVoice.submitText(text) : phonePairing?.userText(text) || false });
const panel = element('panel');
const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function toast(message) {
  element('toast').textContent = message;
  element('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element('toast').classList.remove('visible'), 4000);
}

function save() {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { toast('This visit could not be saved. Pip can still keep you company.'); }
  refresh();
}

function refresh() {
  element('day-count').textContent = state.day === 1 ? 'Your first day together' : `Day ${state.day} together`;
  element('memory-count').textContent = state.memories.length ? `${state.memories.length} little ${state.memories.length === 1 ? 'memory' : 'memories'} kept` : 'The things we keep';
  element('memory-picture')?.setAttribute('visibility', state.memories.some(memory => memory.id === 'recital-drawing') ? 'visible' : 'hidden');
  element('new-leaf')?.setAttribute('visibility', state.day > 1 ? 'visible' : 'hidden');
  element('sound-button').setAttribute('aria-pressed', String(state.sound));
  element('sound-button').querySelector('span').textContent = state.sound ? 'Sound on' : 'Sound off';
  element('sound-button').setAttribute('aria-label', state.sound ? 'Turn spoken replies off' : 'Turn spoken replies on');
  document.body.classList.toggle('large-text', state.largeText);
  document.querySelector('.world').dataset.atmosphere = state.atmosphere;
  document.querySelector('.world').dataset.vibe = state.vibe;
  document.querySelector('.world').dataset.window = state.window;
  document.body.dataset.vibe = state.vibe;
  element('vibe-switch').setAttribute('aria-label', state.vibe === 'cozy' ? 'Switch to crisp and cold' : 'Switch to warm and cozy');
  element('vibe-switch').querySelector('span').textContent = state.vibe === 'cozy' ? 'Cold vibe' : 'Cozy vibe';
  element('sunflowers')?.setAttribute('visibility', state.garden === 'sunflowers' ? 'visible' : 'hidden');
  element('moonflowers')?.setAttribute('visibility', state.garden === 'moonflowers' ? 'visible' : 'hidden');
  element('story-lantern')?.setAttribute('visibility', state.storyPath.length === 2 ? 'visible' : 'hidden');
}

function setMood(mood = 'content') {
  pip?.setAttribute('class', mood === 'thoughtful' ? 'pip-idle pip-thoughtful' : mood === 'attentive' ? 'pip-idle pip-attentive' : 'pip-idle');
  element('mood-label').textContent = `feeling ${mood === 'attentive' ? 'glad you’re here' : mood}`;
  if (pip && !characterActions?.active) pip.dataset.expression = mood === 'thoughtful' ? 'tender' : mood === 'attentive' ? 'curious' : 'smile';
  if (element('watering-can')) element('watering-can').style.opacity = mood === 'content' ? '1' : '0';
}

async function speak(text, { force = false } = {}) {
  if ((!state.sound && !force) || !speechAllowed || document.hidden || liveVoice || phonePairing?.voice) return;
  await configReady;
  if ((!state.sound && !force) || document.hidden || liveVoice || phonePairing?.voice) return;
  if (sonicAvailable) {
    stopSpeech();
    const controller = new AbortController(); speechRequest = controller;
    try {
      const response = await fetch(`${backendUrl}/api/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 800), voice: state.voice }), signal: controller.signal });
      if (!response.ok) throw new Error('Speech unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      storyAudio = new Audio(url);
      storyAudio.onplay = () => pip?.classList.add('speaking');
      storyAudio.onended = storyAudio.onerror = () => { pip?.classList.remove('speaking'); URL.revokeObjectURL(url); };
      await storyAudio.play();
    } catch (error) { if (error.name !== 'AbortError') toast('Cozy voice is taking a moment. Captions are always here.'); }
    return;
  }
  toast('Cozy voice is unavailable. Captions are here; no robotic fallback.');
}

function stopSpeech() {
  speechRequest?.abort();
  if (storyAudio) { storyAudio.pause(); URL.revokeObjectURL(storyAudio.src); storyAudio = null; }
  window.HearthNative?.stopSpeaking?.();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  pip?.classList.remove('speaking');
}

function stopLiveVoice() {
  phonePairing?.stop(); phonePairing = null;
  liveVoice?.stop(); liveVoice = null;
  characterActions?.listening(false);
  if (pip) { delete pip.dataset.presence; pip.style.removeProperty('--voice-open'); }
  pip?.classList.remove('speaking');
  document.querySelector('.world').classList.remove('voice-active');
  element('live-status')?.remove();
}

function say(text, choices = [], mood = 'attentive') {
  companionActivities.stop();
  characterActions?.stop(); firesideTune.stop();
  clearInvitation();
  stopLiveVoice();
  requestController?.abort();
  element('talk-button').disabled = false;
  clearTimeout(idleTimer);
  setMood(mood);
  if (mood !== 'content') element('pip-position')?.setAttribute('transform', 'translate(740 466)');
  element('activity-label').textContent = mood === 'thoughtful' ? 'Pip is listening, without a rush' : mood === 'content' ? 'Pip is enjoying a quiet moment' : 'Pip is spending a moment with you';
  element('dialogue').textContent = text;
  element('choices').replaceChildren();
  for (const [label, action] of choices) {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', action);
    element('choices').append(button);
  }
  speak(text);
  scheduleIdle();
  scheduleInvitation();
}

function home() {
  closePanel();
  demoStep = -1;
  element('demo-button').textContent = 'Try the story demo →';
  const greeting = state.name ? `Hello, ${state.name}. ` : 'Oh, hello. ';
  if (hasMemory(state, 'connection')) say(`${greeting}How did your time with your granddaughter go?${hasMemory(state, 'recital-drawing') ? ' There’s a little drawing from the recital on our wall.' : ''}`, [['We had a lovely chat', () => say('That sounds like a lovely moment. Shall we enjoy the fire for a while?', [['Let’s sit together', quietCompany]])], ['The call is still coming up', () => say('Something to look forward to, then. Until then, we can enjoy this afternoon.', [['Let’s sit', quietCompany]])], ['Let’s just sit', quietCompany]]);
  else if (hasMemory(state, 'recital')) say(`${greeting}You told me about your granddaughter’s recital. How did it go?`, [['She was wonderful', recitalWentWell], ['The house feels quiet', quiet], ['Let’s just sit', quietCompany]]);
  else say(`${greeting}I was just giving the fern a little water. Come sit with me?`, [['I’d like that', quietCompany], ['My granddaughter has a recital', recital], ['The house feels quiet', quiet]], 'content');
}

function quietCompany() {
  invitationShown = true;
  say('Of course. We don’t have to fill every moment. I’ll keep you company by the fire.', [['Tell me something', () => say(state.day > 1 ? 'The fern has a tiny new leaf. It wasn’t there when we first met. I like how little things find their own time.' : 'I think the fern is getting ready to grow a new leaf. I keep checking, but plants have their own sense of time.', [['Let’s play a game', room], ['Stay a while', quietCompany]])], ['Something together', room]], 'content');
}

function recital() {
  remember(state, 'recital', 'You told Pip about your granddaughter’s recital. Pip would like to ask how it went.');
  save();
  say(state.remember ? 'A recital! That sounds like a big day for her. I’d love to hear how it goes when you come back.' : 'A recital! That sounds like a big day for her. Tell me a little about it?', [['She was wonderful', recitalWentWell], ['Visit tomorrow (demo)', nextDay]]);
}

function recitalWentWell() {
  remember(state, 'recital-drawing', 'Your granddaughter’s recital inspired a drawing in Pip’s home.');
  save();
  say(state.remember ? 'I’m glad. I made a little picture to remember it by. Was there a part you especially loved?' : 'I’m glad. Was there a part you especially loved?', [['I wish we talked more', quiet], ['Help me write to her', message], ['Let’s enjoy the moment', quietCompany]]);
}

function quiet() {
  say('It sounds like you’re missing having someone around. We can sit for a bit. Or, if you’d like, we could think of a small way to reach someone you care about.', [['Help me write to her', message], ['A little game together', room], ['Just stay with me', quietCompany]], 'thoughtful');
}

function openPanel(kicker, html, preserveVoice = false) {
  companionActivities.stop();
  characterActions?.stop(); firesideTune.stop();
  clearInvitation();
  if (preserveVoice) keepVoiceOnClose = true;
  else stopLiveVoice();
  clearInterval(breathTimer);
  clearTimeout(idleTimer);
  recognition?.abort();
  listening = false;
  if (!panel.open) lastFocus = document.activeElement;
  element('panel-kicker').textContent = kicker;
  element('panel-content').innerHTML = html;
  if (!panel.open) panel.showModal();
  panel.querySelector('#panel-content button:not(:disabled), #panel-content input, #panel-content textarea')?.focus();
}

function closePanel() { if (panel.open) panel.close(); }
panel.addEventListener('close', () => { recognition?.abort(); listening = false; if (!keepVoiceOnClose) stopLiveVoice(); keepVoiceOnClose = false; clearInterval(breathTimer); lastFocus?.focus(); scheduleIdle(); scheduleInvitation(); });
element('close-panel').addEventListener('click', closePanel);

function message() {
  openPanel('A LITTLE CONNECTION', '<h2>A note to your granddaughter</h2><p>You can change these words to make them your own.</p><label class="field">Your message<textarea id="message-text">I was thinking of you and your recital. I’d love to hear about it. Shall we have a little call this week?</textarea></label><div class="panel-actions"><button class="primary-button" id="share-message">Share this note</button><button class="subtle-button" id="connection-done">We’ve arranged a call</button></div><p class="privacy-note">Nothing is sent automatically. Share from a supported device, or read the note aloud when you call. Confirm a call only after you arrange it yourself.</p>');
  element('share-message').onclick = async () => {
    const text = element('message-text').value.trim();
    if (!text) { toast('Add a few words to your note first.'); return; }
    try {
      if (window.HearthNative) { window.HearthNative.share(text); }
      else if (navigator.share) { await navigator.share({ title: 'A little note', text }); }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); toast('Note copied. You can paste it into your messages.'); }
      else toast('You can read this note aloud when you call.');
    } catch (error) { if (error.name !== 'AbortError') toast('Sharing is unavailable here. You can read the note aloud.'); }
  };
  element('connection-done').onclick = () => {
    remember(state, 'connection', 'You said you arranged a call with your granddaughter. Pip will ask how it went.');
    save(); closePanel();
    say('Something to look forward to. You can tell me how it goes next time you’re here.', [['Visit tomorrow (demo)', nextDay], ['Sit by the fire', quietCompany]]);
  };
}

function nextDay() {
  state.day += 1; save();
  element('day-label').textContent = 'A fresh little morning';
  toast(`Demo time advance: day ${state.day}. Your memories stay.`);
  home();
}

function memories() {
  openPanel('THE THINGS WE KEEP', `<h2>Our memories</h2><p>Small moments, remembered with your permission.</p>${state.memories.length ? state.memories.map(memory => `<article class="memory"><small>DAY ${memory.day} TOGETHER</small><p>${escapeHtml(memory.text)}</p><button class="subtle-button" data-forget="${escapeHtml(memory.id)}">Forget this memory</button></article>`).join('') : '<p>Our story is just beginning. Tell Pip about the recital, or spend a little time together.</p>'}<p class="privacy-note">Memories stay in this browser on this device. Forgetting the recital also removes its drawing and related follow-up. ${state.remember ? '' : 'Remembering is paused. Your earlier memories are kept, but Pip will not use them until you turn remembering back on.'}</p>`);
  panel.querySelectorAll('[data-forget]').forEach(button => button.onclick = () => { forget(state, button.dataset.forget); history = []; pendingMemory = null; save(); memories(); toast('That memory has been forgotten.'); });
}

const questions = [
  { question: 'Which of these is a little visitor to a garden?', options: ['A robin', 'A teacup', 'A mitten'], answer: 0, detail: 'A robin. Pip likes to watch them from the window.' },
  { question: 'What helps a little fern grow?', options: ['A woolly scarf', 'Water and gentle light', 'A bedtime story'], answer: 1, detail: 'Water and gentle light. Though Pip insists a story can’t hurt.' },
  { question: 'What do we call a group of stars making a pattern?', options: ['A constellation', 'A bookshelf', 'A bouquet'], answer: 0, detail: 'A constellation. A picture hiding in the night sky.' }
];

function room() {
  openPanel('SOMETHING TOGETHER', '<h2>A little time, well spent.</h2><p>A gentle game, a story we shape together, or something new in the garden.</p><div class="activity-grid"><button class="activity-tile" id="solo-game" aria-label="Play with Pip"><strong>A fireside game</strong><span>Three little questions with Pip</span></button><button class="activity-tile" id="shared-game" aria-label="Room Mode · 2 people"><strong>Room Mode · 2 people</strong><span>Pass the remote. Share the moment.</span></button><button class="activity-tile" id="story-button"><strong>The lantern path</strong><span>An unfolding story. Your choices matter.</span></button><button class="activity-tile" id="garden-button"><strong>Our little garden</strong><span>Choose a flower. Leave a little colour.</span></button><button class="activity-tile" id="breathe-button"><strong>A quieter minute</strong><span>Follow the fireflies. No conversation needed.</span></button><button class="activity-tile" id="atmosphere-button"><strong>Make it cozy</strong><span>Daylight, rain, or an evening fire</span></button></div>');
  element('solo-game').onclick = () => startGame(1);
  const danceTile = document.createElement('button'); danceTile.id = 'dance-with-pip'; danceTile.className = 'activity-tile'; danceTile.innerHTML = '<strong>Pip’s fireside shuffle</strong><span>A little dance. A little silliness.</span>'; danceTile.onclick = danceWithPip; element('solo-game').parentElement.append(danceTile);
  const movieTile = document.createElement('button'); movieTile.id = 'movie-night'; movieTile.className = 'activity-tile'; movieTile.textContent = 'Movie night with Pip · Your taste. Her opinions.'; movieTile.onclick = () => cinema.show(); element('solo-game').parentElement.append(movieTile);
  const surpriseTile = document.createElement('button'); surpriseTile.id = 'pip-surprise'; surpriseTile.className = 'activity-tile'; surpriseTile.innerHTML = '<strong>Surprise me, Pip</strong><span>She has a few ideas of her own.</span>'; surpriseTile.onclick = surpriseWithPip; element('solo-game').parentElement.append(surpriseTile);
  for (const [action, title, description] of [['riddle', 'A little fireside riddle', 'A guess, a giggle, and no score.'], ['word-game', 'The unlikely picnic', 'Make something wonderfully ridiculous.'], ['tiny-story', 'Make a tiny story', 'A little adventure with two possibilities.'], ['connection-note', 'Send a little hello', 'Draft a note. You decide how to share.'], ['juggle', 'Pip’s woodland juggling', 'Three treasures. Questionable technique.'], ['tea', 'An imaginary cup of tea', 'A quiet, unhurried moment.']]) {
    const tile = document.createElement('button'); tile.className = 'activity-tile'; tile.dataset.activity = action;
    const heading = document.createElement('strong'); heading.textContent = title;
    const detail = document.createElement('span'); detail.textContent = description; tile.append(heading, detail);
    tile.onclick = () => { closePanel(); performWorldAction({ action }); };
    element('solo-game').parentElement.append(tile);
  }
  element('shared-game').onclick = () => startGame(2);
  element('story-button').onclick = story;
  element('garden-button').onclick = garden;
  element('breathe-button').onclick = breathe;
  element('atmosphere-button').onclick = atmosphere;
}

function voiceActivity(activity) {
  if (!pip) return;
  if (activity === 'listening' && characterActions?.active) { characterActions.stop(); element('pip-position')?.setAttribute('transform', 'translate(740 466)'); }
  pip.dataset.presence = activity;
  characterActions?.listening(activity === 'listening');
  if (!characterActions?.active) {
    pip.dataset.expression = activity === 'thinking' || activity === 'listening' ? 'curious' : activity === 'speaking' ? 'smile' : 'tender';
    element('mood-label').textContent = activity === 'listening' ? 'listening to you' : activity === 'thinking' ? 'finding her words' : activity === 'speaking' ? 'sharing a thought' : 'feeling at home';
  }
  if (!characterActions?.active) element('activity-label').textContent = activity === 'listening' ? 'Pip is listening to you' : activity === 'thinking' ? 'Pip is considering your words' : activity === 'speaking' ? 'Pip is sharing a little thought' : activity === 'paused' ? 'Your microphone is paused' : 'Pip is here with you';
}

function voiceEnergy(energy) { pip?.style.setProperty('--voice-open', String(0.25 + Math.min(1, Math.max(0, energy)) * 1.1)); }

function performWorldAction(input) {
  try {
    const { action, expression, text } = validateWorldAction({ action: input.action, ...(input.expression ? { expression: input.expression } : {}), ...(input.text !== undefined ? { text: input.text } : {}) });
    if (!pip || document.hidden) return { ok: false };
    if (TV_ACTIONS.includes(action)) return cinema.action(action, text) || movieNight.action(action, text);
    if (applyAmbience(state, action)) {
      save(); updateClock();
      const summary = action === 'cozy' ? 'Our home turns honey-gold. A warm fire, a closed window, and nowhere to rush.' : action === 'cold' ? 'A crisp blue morning. Snow outside, an open window, and Pip’s favorite scarf.' : action === 'open-window' ? 'The window opens. A little fresh air moves through Pip’s home.' : 'The window closes. The little home feels sheltered again.';
      element('scene-subtitle').textContent = summary;
      return { ok: true, summary };
    }
    if (ACTIVITY_ACTIONS.includes(action)) {
      if (panel.open && liveVoice) element('show-voice-home')?.click();
      else if (panel.open && phonePairing) element('pair-home')?.click();
      characterActions.perform({ action: action === 'connection-note' ? 'nod' : action === 'tiny-story' ? 'read' : 'express', expression: expression || 'curious' });
      return companionActivities.show(action, text);
    }
    if (action === 'stargaze') { state.atmosphere = 'evening'; save(); updateClock(); }
    if (['rain', 'evening', 'daylight'].includes(action)) {
      state.atmosphere = action === 'daylight' ? 'day' : action; save(); updateClock();
      element('scene-subtitle').textContent = action === 'rain' ? 'Rain taps softly on our window.' : action === 'evening' ? 'Our little home is warm in the evening light.' : 'A little sunshine for our home.';
      return { ok: true };
    }
    if (['sunflowers', 'moonflowers'].includes(action)) {
      state.garden = action; save(); element('scene-subtitle').textContent = `A little patch of ${action}, chosen together.`;
      return { ok: true };
    }
    return characterActions.perform({ action, ...(expression ? { expression } : {}) });
  } catch { return { ok: false }; }
}

function danceWithPip() {
  closePanel();
  say('I call this the fireside shuffle. The trick is to look as though you meant to do that little wobble.', [['Play our little tune', async () => { stopSpeech(); performWorldAction({ action: 'dance' }); try { await firesideTune.play(); } catch { toast('The tune couldn’t play. Pip can still dance.'); } }], ['Encore, Pip!', danceWithPip], ['Let’s sit together', quietCompany]]);
  performWorldAction({ action: 'dance' });
}

let surpriseCount = 0;
function surpriseWithPip() {
  closePanel();
  const moments = [
    ['I tried reading a book about gardening to the fern. She seemed more interested in the watering chapter.', 'water'],
    ['A very dignified stretch. I learned it from a cat who refused to explain herself.', 'stretch'],
    ['A little wave, just because. Not every hello needs an occasion.', 'wave'],
    ['My dancing has been described as “unexpected.” By me. Everyone else was too polite.', 'dance'],
    ['I found a story about a mouse who opened a tiny umbrella shop. Business was small, but she had big plans.', 'read'],
    ['Three woodland treasures. Two paws. What could possibly go wrong? Please do not answer that mathematically.', 'juggle'],
    ['A grand bow. The fern has asked for an encore, but I suspect she just wants more water.', 'bow'],
    ['I have made imaginary tea. It is wonderfully affordable and never stains the rug.', 'tea'],
    ['A very small twirl. I am saving the large one for when the furniture is insured.', 'twirl']
  ];
  const [words, action] = moments[surpriseCount++ % moments.length];
  say(words, [['Another little surprise', surpriseWithPip], ['Let’s dance', danceWithPip], ['Just stay here', quietCompany]]);
  performWorldAction({ action });
}

function garden() {
  openPanel('OUR LITTLE GARDEN', `<h2>A little colour for our home.</h2><p>${state.garden ? `Our ${state.garden} are growing by the window. We can keep them, or try something new.` : 'I found two packets of seeds on the bookshelf. What shall we plant?'}</p><div class="garden-preview"><span class="flower-illustration sunflower"></span><span class="flower-illustration moonflower"></span></div><div class="panel-actions"><button class="primary-button" id="plant-sunflowers">Sunflowers · bright and golden</button><button class="subtle-button" id="plant-moonflowers">Moonflowers · soft and silver</button></div><p class="privacy-note">Your flower choice changes Pip’s home. There are no streaks, deadlines, or neglected plants when you’re away.</p>`);
  const plant = kind => {
    state.garden = kind;
    if (state.remember) {
      forget(state, 'garden');
      remember(state, 'garden', `You chose ${kind} for the little garden you share with Pip.`);
    }
    save(); closePanel();
    say(kind === 'sunflowers' ? 'Golden little suns. That was a lovely choice. I’ll find them a spot where the afternoon light falls.' : 'Moonflowers. Soft little stars for the evening. I think they’ll make our window feel rather magical.', [['Look at our garden', garden], ['Sit together', quietCompany]]);
  };
  element('plant-sunflowers').onclick = () => plant('sunflowers');
  element('plant-moonflowers').onclick = () => plant('moonflowers');
}

function story() {
  const chapter = state.storyPath.length;
  const options = chapter === 0 ? [['Follow the little owl', 'owl'], ['Listen beside the stream', 'stream']] : [['Carry the lantern home', 'lantern'], ['Plant a seed beneath the stars', 'seed']];
  const text = chapter === 0 ? 'At the edge of the garden, Pip finds a tiny lantern. A little owl is waiting on the gate, while a stream hums beyond the trees. Where should our evening begin?' : chapter === 1 ? state.storyPath[0] === 'owl' ? 'The owl leads Pip to a clearing full of fireflies. “Something small can light a whole journey,” it says. The lantern is glowing, and a silver seed rests beside it. What shall Pip bring back?' : 'Beside the stream, Pip watches the stars reflected in the water. A silver seed drifts to the bank, beside the little lantern. “Some things grow quietly,” Pip thinks. What shall we bring home?' : state.storyPath[1] === 'lantern' ? 'Pip brings the lantern home and sets it beside the window. Its little light is a reminder of our walk. The path will be there whenever we want to return.' : 'We plant the silver seed and hang the lantern nearby. One evening, perhaps, a new leaf will catch the starlight. Some stories end by beginning something else.';
  openPanel(`THE LANTERN PATH · ${Math.min(chapter + 1, 3)} / 3`, `<h2>${chapter === 2 ? 'A little light to keep.' : 'Where shall we wander?'}</h2><div class="story-art"><span class="lantern-glow"></span><span class="story-stars">· &nbsp; ✦ &nbsp; · &nbsp; ✦ &nbsp; ·</span></div><p>${text}</p><div class="panel-actions">${chapter < 2 ? options.map(([label, id]) => `<button class="${id === options[0][1] ? 'primary-button' : 'subtle-button'}" data-story="${id}">${label}</button>`).join('') : '<button class="primary-button" id="story-finish">Back to our little home</button><button class="subtle-button" id="story-restart">Tell it another way</button>'}</div>`);
  panel.querySelectorAll('[data-story]').forEach(button => button.onclick = () => { state.storyPath.push(button.dataset.story); save(); story(); });
  if (chapter === 2) {
    remember(state, 'lantern-story', `Together, you and Pip followed ${state.storyPath[0] === 'owl' ? 'an owl' : 'the stream'} and chose to ${state.storyPath[1] === 'lantern' ? 'bring a lantern home' : 'plant a silver seed'}.`); save();
    element('story-finish').onclick = () => { closePanel(); say('A little light from our adventure. I like having something here that we chose together.', [['Another quiet moment', quietCompany], ['Our garden', garden]]); };
    element('story-restart').onclick = () => { state.storyPath = []; forget(state, 'lantern-story'); save(); story(); };
  }
}

function breathe() {
  openPanel('A QUIETER MINUTE', '<h2>Just follow the little light.</h2><p>No need to get it right. Breathe comfortably, or simply watch.</p><div class="breathing-orbit"><span id="breathing-light"></span></div><p id="breathing-label" class="breathing-label" aria-live="polite">Let the light grow. Breathe in, if comfortable.</p><div class="panel-actions"><button class="primary-button" id="end-breathing">Back to the fire</button></div>');
  let seconds = 0;
  breathTimer = setInterval(() => {
    seconds++;
    if (!element('breathing-label')) return;
    element('breathing-label').textContent = seconds % 10 < 4 ? 'Let the light grow. Breathe in, if comfortable.' : 'Let it settle. A soft breath out.';
    if (seconds >= 60) { clearInterval(breathTimer); element('breathing-label').textContent = 'A little minute, just for you.'; }
  }, 1000);
  element('end-breathing').onclick = () => { clearInterval(breathTimer); closePanel(); quietCompany(); };
}

function atmosphere() {
  openPanel('A DIFFERENT FEELING', `<h2>How should our little home feel?</h2><p>Choose a whole mood, then make it your own. This changes Pip’s fictional home, not your room’s temperature.</p><div class="vibe-options"><button class="vibe-tile cozy-tile" data-vibe="cozy" aria-pressed="${state.vibe === 'cozy'}"><strong>Warm & cozy</strong><span>Honey light, a lively fire, a sheltered window.</span></button><button class="vibe-tile cold-tile" data-vibe="cold" aria-pressed="${state.vibe === 'cold'}"><strong>Crisp & cold</strong><span>Blue light, drifting snow, a scarf and fresh air.</span></button></div><h3>The window</h3><div class="panel-actions"><button class="subtle-button" data-window="open" aria-pressed="${state.window === 'open'}">Open the window</button><button class="subtle-button" data-window="closed" aria-pressed="${state.window === 'closed'}">Close the window</button></div><h3>Light & weather</h3><div class="game-options"><button class="subtle-button" data-atmosphere="auto">Follow the time of day</button><button class="subtle-button" data-atmosphere="day">A golden afternoon</button><button class="subtle-button" data-atmosphere="evening">An evening by the fire</button><button class="subtle-button" data-atmosphere="rain">Rain against the window</button></div>`);
  panel.querySelectorAll('[data-vibe],[data-window]').forEach(button => button.onclick = () => { performWorldAction({ action: button.dataset.vibe || (button.dataset.window === 'open' ? 'open-window' : 'close-window') }); closePanel(); toast('A little change of feeling. Saved for your next visit.'); });
  panel.querySelectorAll('[data-atmosphere]').forEach(button => button.onclick = () => { state.atmosphere = button.dataset.atmosphere; save(); updateClock(); closePanel(); toast('A little change of atmosphere.'); });
}

function startGame(count) { roomPlayers = count; gameRound = 0; player = 1; scores = [0, 0]; game(); }

function game() {
  const question = questions[gameRound];
  openPanel(roomPlayers === 2 ? `ROOM MODE · PLAYER ${player}` : 'FIRESIDE WITH PIP', `<h2>${escapeHtml(question.question)}</h2><p>Question ${gameRound + 1} of 3${roomPlayers === 2 ? ' · Pass the remote after your turn.' : ' · No timer. No rush.'}</p><div class="game-options">${question.options.map((option, index) => `<button class="subtle-button" data-answer="${index}">${escapeHtml(option)}</button>`).join('')}</div><p id="game-feedback" aria-live="polite"></p><div class="panel-actions"><button class="primary-button" id="next-question" hidden>Continue →</button></div>`);
  panel.querySelectorAll('[data-answer]').forEach(button => button.onclick = () => {
    if (button.disabled) return;
    const correct = Number(button.dataset.answer) === question.answer;
    if (correct) scores[player - 1]++;
    element('game-feedback').textContent = `${correct ? 'You found it! ' : 'A lovely guess. '}${question.detail}`;
    panel.querySelectorAll('[data-answer]').forEach(option => { option.disabled = true; });
    element('next-question').hidden = false;
    element('next-question').focus();
  });
  element('next-question').onclick = () => {
    if (roomPlayers === 2 && player === 1) { player = 2; game(); return; }
    player = 1; gameRound++;
    if (gameRound < questions.length) { game(); return; }
    remember(state, 'fireside-game', `You played a fireside game ${roomPlayers === 2 ? 'together in Room Mode' : 'with Pip'}.`); save();
    openPanel('A MOMENT WELL SPENT', `<h2>A little wonder, together.</h2><p>${roomPlayers === 2 ? `Player 1 found ${scores[0]} answers. Player 2 found ${scores[1]}.` : `You found ${scores[0]} of 3 answers.`} Thank you for keeping Pip company.</p><div class="panel-actions"><button class="primary-button" id="game-home">Back to the fire</button></div>`);
    element('game-home').onclick = () => { closePanel(); say('That was lovely. A little game makes the afternoon feel different, doesn’t it?', [['Let’s sit', quietCompany], ['Play again', room]]); };
  };
}

function settings() {
  openPanel('MAKE YOURSELF AT HOME', `<h2>Your little corner</h2><label class="field">What should Pip call you?<input id="name-input" maxlength="40" value="${escapeHtml(state.name)}" placeholder="Your first name (optional)"></label><label class="field">Pip’s cozy voice<select id="voice-select"><option value="tiffany" ${state.voice === 'tiffany' ? 'selected' : ''}>Tiffany · warm American English</option><option value="amy" ${state.voice === 'amy' ? 'selected' : ''}>Amy · gentle British English</option><option value="olivia" ${state.voice === 'olivia' ? 'selected' : ''}>Olivia · Australian English</option></select></label><label class="setting-row"><input type="checkbox" id="remember-input" ${state.remember ? 'checked' : ''}> Remember our moments on this device</label><label class="setting-row"><input type="checkbox" id="sound-input" ${state.sound ? 'checked' : ''}> Read Pip’s story replies aloud</label><label class="setting-row"><input type="checkbox" id="large-input" ${state.largeText ? 'checked' : ''}> Larger text</label><label class="setting-row"><input type="checkbox" id="connected-input" ${state.connectedDialogue ? 'checked' : ''} ${backendAvailable ? '' : 'disabled'}> Connected AI dialogue ${backendAvailable ? '(available)' : '(not configured)'}</label><p class="privacy-note">Live voice uses Amazon Nova Sonic when available. It sends microphone audio and enabled memory context to Amazon Bedrock only after you start a conversation. Story replies can use device speech; live Sonic voice has its own controls.</p><div class="panel-actions"><button class="primary-button" id="save-settings">Save preferences</button><button class="subtle-button" id="reset-home">Clear my memories</button></div><p class="privacy-note">${state.connectedDialogue && backendAvailable ? 'Connected dialogue is enabled.' : 'Story mode uses local scripted dialogue.'} This version uses an illustrated SVG character. Hearth does not save microphone recordings. Memories proposed by AI require confirmation.</p>`);
  element('save-settings').onclick = () => {
    state.name = element('name-input').value.trim();
    state.remember = element('remember-input').checked;
    state.sound = element('sound-input').checked;
    state.largeText = element('large-input').checked;
    state.gentleInvitations = element('invitation-input').checked;
    state.connectedDialogue = backendAvailable && element('connected-input').checked;
    state.voice = element('voice-select').value;
    history = []; pendingMemory = null;
    requestController?.abort();
    if (!state.sound) stopSpeech();
    save(); home(); toast('Your preferences are saved.');
  };
  const invitationSetting = document.createElement('label'); invitationSetting.className = 'setting-row';
  invitationSetting.innerHTML = `<input type="checkbox" id="invitation-input" ${state.gentleInvitations ? 'checked' : ''}> Let Pip gently suggest something after a quiet pause`;
  element('large-input').closest('label').after(invitationSetting);
  element('reset-home').onclick = () => {
    openPanel('YOUR CHOICE', '<h2>Clear all our memories?</h2><p>This removes saved moments, your name, preferences, and changes to Pip’s home from this device.</p><div class="panel-actions"><button class="primary-button" id="confirm-reset">Clear everything</button><button class="subtle-button" id="cancel-reset">Keep them</button></div>');
    element('confirm-reset').onclick = () => { requestController?.abort(); stopSpeech(); history = []; pendingMemory = null; state = freshState(); save(); home(); toast('A fresh start. Your memories have been removed.'); };
    element('cancel-reset').onclick = settings;
  };
}

function storyReply(text) {
  if (replyFor(text) !== 'urgent' && !/\b(don’t|don't|do not|stop|no)\b/i.test(text) && /\b(dance|dancing)\b/i.test(text)) { danceWithPip(); return; }
  if (replyFor(text) !== 'urgent' && /\b(surprise me|something funny)\b/i.test(text)) { surpriseWithPip(); return; }
  switch (replyFor(text)) {
    case 'quiet': quiet(); break;
    case 'recital': recital(); break;
    case 'game': room(); break;
    case 'thanks': say('You’re welcome. I’ve enjoyed this little moment with you.', [['Stay by the fire', quietCompany]]); break;
    case 'goodbye': say('Take care. You can come back whenever you’d like. I’ll be tending to my little home.', [['Just sit for a moment', quietCompany]], 'content'); break;
    case 'urgent': say('Please reach a real person who can help right now. If you’re in immediate danger or having a medical emergency, call your local emergency number. I can’t provide emergency care.', [['Stay by the fire', quietCompany]], 'thoughtful'); break;
    default: say('I’m glad you’re here. In this story demo, we can talk about the recital, enjoy a quiet moment, or play a little game.', [['The recital', recital], ['A quiet moment', quietCompany], ['A game', room]]);
  }
}

async function respond(text) {
  closePanel();
  if (!backendAvailable || !state.connectedDialogue || demoStep >= 0 || replyFor(text) === 'urgent') { storyReply(text); return; }
  say('Let me put down my watering can. I’m listening.', [], 'thoughtful');
  const controller = new AbortController();
  requestController = controller;
  element('talk-button').disabled = true;
  try {
    const response = await fetch(`${backendUrl}/api/dialogue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, name: state.name, day: state.day, memories: state.remember ? state.memories : [], history }), signal: controller.signal });
    if (!response.ok) throw new Error('Dialogue unavailable');
    const reply = await response.json();
    if (typeof reply.text !== 'string' || !reply.text.trim()) throw new Error('Invalid dialogue');
    history = [...history, { role: 'user', text }, { role: 'assistant', text: reply.text }].slice(-12);
    const choices = [['Tell Pip more', talk], ['Sit together', quietCompany]];
    if (reply.action === 'connection') choices.unshift(['Prepare a note', message]);
    if (reply.action === 'game') choices.unshift(['A little game', room]);
    pendingMemory = state.remember && typeof reply.memory === 'string' && reply.memory ? reply.memory : null;
    if (pendingMemory) choices.unshift(['Remember this moment', confirmMemory]);
    say(reply.text, choices, ['content', 'thoughtful', 'attentive'].includes(reply.mood) ? reply.mood : 'attentive');
    if (WORLD_ACTIONS.includes(reply.action)) performWorldAction({ action: reply.action });
  } catch (error) {
    if (error.name !== 'AbortError') { toast('Connected dialogue is unavailable. Pip is staying in story mode.'); storyReply(text); }
  } finally { if (requestController === controller) element('talk-button').disabled = false; }
}

function confirmMemory() {
  if (!pendingMemory) return;
  const proposed = pendingMemory;
  openPanel('A MOMENT TO KEEP', `<h2>Would you like me to remember?</h2><p>${escapeHtml(proposed)}</p><div class="panel-actions"><button class="primary-button" id="keep-memory">Keep this memory</button><button class="subtle-button" id="skip-memory">Let it go</button></div>`);
  element('keep-memory').onclick = () => { remember(state, `moment-${Date.now()}`, proposed); pendingMemory = null; save(); closePanel(); toast('A little moment, kept.'); };
  element('skip-memory').onclick = () => { pendingMemory = null; closePanel(); toast('This moment won’t be saved.'); };
}

function talk() {
  openPanel('A MOMENT WITH PIP', `<h2>What’s on your mind?</h2>${sonicAvailable ? '<button class="live-voice-invitation" id="cozy-voice"><span class="voice-orb"></span><span><strong>Speak with Pip, naturally.</strong><small>A cozy Nova Sonic voice. You can interrupt.</small></span><span>→</span></button>' : ''}<p>Type a few words, or use your microphone if your device supports it.</p><form id="talk-form"><label class="field">Your words<input id="talk-text" maxlength="500" placeholder="The house has been quiet lately…" autocomplete="off"></label><div class="panel-actions"><button class="primary-button" type="submit">Tell Pip</button><button class="subtle-button" type="button" id="start-voice">Use microphone</button></div></form><p id="voice-status" class="privacy-note" aria-live="polite">${state.connectedDialogue && backendAvailable ? 'Connected dialogue: your words and enabled memories are sent to Amazon Bedrock.' : 'Story mode: try “the house is quiet” or “my granddaughter’s recital”.'} Voice access starts only when you choose it.</p>`);
  if (element('cozy-voice')) element('cozy-voice').onclick = voiceConversation;
  element('talk-form').onsubmit = event => { event.preventDefault(); const text = element('talk-text').value.trim(); if (text) respond(text); };
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (window.HearthNative) {
    element('start-voice').onclick = () => window.HearthNative.listen();
  } else if (!SpeechRecognition) {
    element('start-voice').disabled = true;
    element('voice-status').textContent += ' Microphone recognition is unavailable here. Use the typed input or remote replies.';
  } else {
    element('start-voice').onclick = () => {
      if (listening) { recognition.stop(); return; }
      recognition = new SpeechRecognition(); recognition.lang = 'en-US'; recognition.interimResults = false;
      recognition.onstart = () => { listening = true; if (element('voice-status')) element('voice-status').textContent = 'Listening… take your time.'; if (element('start-voice')) element('start-voice').textContent = 'Stop listening'; };
      recognition.onresult = event => { if (element('talk-text')) element('talk-text').value = event.results[0][0].transcript; if (element('voice-status')) element('voice-status').textContent = 'Check your words, then choose Tell Pip.'; };
      recognition.onerror = () => { if (element('voice-status')) element('voice-status').textContent = 'The microphone could not connect. You can type or choose a reply instead.'; };
      recognition.onend = () => { listening = false; if (element('start-voice')) element('start-voice').textContent = 'Use microphone'; };
      try { recognition.start(); } catch { toast('Voice is unavailable. You can type your reply.'); }
    };
  }
}

function voiceConversation() {
  stopSpeech();
  voiceTranscript = '';
  openPanel('A REAL CONVERSATION', `<h2>A little company, in your own words.</h2><div class="live-voice-portrait"><img src="pip.svg" alt="Pip"><span class="voice-rings"></span></div><p id="live-voice-status" class="voice-status" role="status">A warm ${state.voice === 'amy' ? 'British' : state.voice === 'olivia' ? 'Australian' : 'American'} voice, with room for pauses.</p><div class="live-captions"><small>YOU</small><p id="user-caption">Your words will appear here.</p><small>PIP</small><p id="pip-caption">Pip is ready to listen.</p></div><div class="panel-actions"><button class="primary-button" id="start-live">Start our conversation</button><button class="subtle-button" id="show-voice-home" hidden>Enjoy our home</button><button class="subtle-button" id="mute-live" hidden>Pause microphone</button><button class="subtle-button" id="end-live">Back to the fire</button><button class="subtle-button" id="keep-voice-moment" hidden>Keep a moment</button></div><p class="privacy-note">Direct conversation sends microphone audio to Amazon Bedrock. Hands-free mode uses Transcribe and Jev as explained below. Your connection stays on until you end it or disconnect; voice streams renew automatically. Hearth does not record audio. You can pause or end at any time.</p>`);
  element('start-live').onclick = async () => {
    element('start-live').hidden = true;
    document.querySelector('.world').classList.add('voice-active');
    setMood('attentive');
    const target = new URL(`${backendUrl}/api/voice`, location.href); target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
    liveVoice = new RealtimeVoice({
      endpoint: target.href, voice: state.voice, mode: element('voice-mode')?.value || 'conversation',
      context: { name: state.name, day: state.day, viewer: viewerContext(), memories: state.remember ? state.memories : [], recentConversation: history, world: { garden: state.garden, atmosphere: state.atmosphere, vibe: state.vibe, window: state.window, storyPath: state.storyPath } },
      onAction: performWorldAction, onActivity: voiceActivity, onEnergy: voiceEnergy,
      onStatus: status => { if (element('live-voice-status')) element('live-voice-status').textContent = status; if (element('live-status')) element('live-status').textContent = status; },
      onSpeaking: active => { pip?.classList.toggle('speaking', active); document.querySelector('.cinema-pip')?.classList.toggle('is-speaking',active); if (cinema.video) cinema.video.volume=active ? .18 : 1; element('live-voice-status')?.classList.toggle('is-speaking', active); },
      onText: (role, text, final) => {
        const caption = role === 'USER' ? element('user-caption') : role === 'ASSISTANT' ? element('pip-caption') : null;
        if (caption) caption.textContent = text;
        if (role === 'ASSISTANT') {element('dialogue').textContent = text; cinema.caption(text);}
        if (final && ['USER', 'ASSISTANT'].includes(role)) {
          history = [...history, { role: role.toLowerCase(), text: text.slice(0, 1500) }].slice(-12);
          if (role === 'USER') { voiceTranscript = text.slice(0, 500); if (state.remember && element('keep-voice-moment')) element('keep-voice-moment').hidden = false; }
        }
      },
      onError: error => { if (element('live-voice-status')) element('live-voice-status').textContent = error; if (element('start-live')) element('start-live').hidden = false; stopLiveVoice(); }
    });
    try { await liveVoice.start(); if (element('mute-live')) element('mute-live').hidden = false; if (element('show-voice-home')) element('show-voice-home').hidden = false; if (element('start-live-home')) element('start-live-home').hidden = true; }
    catch { if (element('live-voice-status')) element('live-voice-status').textContent = 'The microphone could not start. You can still type or use a remote reply.'; if (element('start-live')) element('start-live').hidden = false; stopLiveVoice(); }
  };
  element('mute-live').onclick = () => { if (liveVoice) element('mute-live').textContent = liveVoice.mute() ? 'Resume microphone' : 'Pause microphone'; };
  element('show-voice-home').onclick = () => {
    keepVoiceOnClose = true; closePanel();
    const status = document.createElement('div'); status.id = 'live-status'; status.className = 'live-home-status'; status.textContent = 'Listening. Take your time.'; document.querySelector('.world').append(status);
    element('choices').replaceChildren();
    for (const [label, action] of [['Pause microphone', event => { if (liveVoice) event.currentTarget.textContent = liveVoice.mute() ? 'Resume microphone' : 'Pause microphone'; }], ['End conversation', () => { stopLiveVoice(); quietCompany(); }], ['Keep a moment', keepVoiceMoment]]) {
      const button = document.createElement('button'); button.textContent = label; button.onclick = action; element('choices').append(button);
    }
  };
  element('end-live').onclick = () => { stopLiveVoice(); closePanel(); quietCompany(); };
  element('keep-voice-moment').onclick = keepVoiceMoment;
  const homeStart = document.createElement('button'); homeStart.id = 'start-live-home'; homeStart.className = 'primary-button'; homeStart.textContent = 'Start in Pip’s home';
  homeStart.onclick = async () => { homeStart.disabled = true; await element('start-live').onclick(); if (liveVoice && element('show-voice-home')) element('show-voice-home').click(); else if (element('start-live-home')) homeStart.disabled = false; };
  element('start-live').after(homeStart);
  const phoneButton = document.createElement('button');
  phoneButton.className = 'subtle-button'; phoneButton.textContent = 'Use your phone as microphone'; phoneButton.onclick = () => pairPhone(element('voice-mode')?.value || 'conversation');
  element('start-live').parentElement.append(phoneButton);
  if (attentionAvailable) {
    const mode = document.createElement('label'); mode.className = 'field'; mode.innerHTML = '<span>How shall we spend this time?</span><select id="voice-mode"><option value="ambient">Hands-free company · Jev decides when it’s for Pip</option><option value="conversation">Just us · direct Nova Sonic conversation</option></select>';
    element('start-live').parentElement.before(mode);
    const privacy = document.createElement('p'); privacy.className = 'privacy-note'; privacy.textContent = 'Hands-free: ambient microphone audio is transcribed by Amazon Transcribe. Transcripts and recent accepted turns go to Jev via OpenRouter, including speech Pip ignores. Only accepted words reach Nova Sonic. Hearth does not store ignored speech. No repeated wake word. Stays on until you end it or disconnect. Classification is experimental, not guaranteed echo cancellation. Starting means you consent to these services processing room speech.';
    element('panel-content').append(privacy);
  }
}

function keepVoiceMoment() {
  stopLiveVoice();
  if (state.remember && voiceTranscript && !/password|bank|credit card|medication|diagnos|suicid|chest pain/i.test(voiceTranscript)) { pendingMemory = `You told Pip: “${voiceTranscript}”`; confirmMemory(); }
  else toast('Let’s keep this conversation private rather than saving it.');
}

function pairingCallbacks() {
  return { backend: backendUrl,
    control:command=>command.action === 'providers' ? movieNight.nativeControl?.({action:'status'}) || {ok:false,summary:'This browser has no native TV media discovery. Use Connected TV app controls for a configured Fire OS bridge.'} : command.action === 'title' && filmById(command.id)?.src ? cinema.watch(filmById(command.id)) : cinema.video ? cinema.control(command.action) : movieNight.request({...command,...(movieNight.endpoint ? {endpoint:movieNight.endpoint} : {})}),
    action: performWorldAction, activity: voiceActivity, energy: voiceEnergy,
    status: message => { if (element('pair-status')) element('pair-status').textContent = message; if (element('live-status')) element('live-status').textContent = message; },
    speaking: active => {pip?.classList.toggle('speaking', active);document.querySelector('.cinema-pip')?.classList.toggle('is-speaking',active);if(cinema.video)cinema.video.volume=active ? .18 : 1;},
    text: (role, text, final) => {
      if (element('pair-caption')) element('pair-caption').textContent = `${role === 'USER' ? 'You' : 'Pip'}: ${text}`;
      if (role === 'ASSISTANT') {element('dialogue').textContent = text; cinema.caption(text);}
      if (final && ['USER', 'ASSISTANT'].includes(role)) history = [...history, { role: role.toLowerCase(), text: text.slice(0, 1500) }].slice(-12);
    },
    ended: () => { if (element('pair-status')) element('pair-status').textContent = 'Pairing ended. Start a new pairing from Talk with Pip.'; pip?.classList.remove('speaking'); element('live-status')?.remove(); }
  };
}

async function pairPhone(mode = 'conversation', coWatch = true) {
  openPanel('YOUR PHONE, PIP’S HOME', '<h2>Bring your voice to the television.</h2><p>Scan with your phone camera. Keep this link private: it shares the memories you have enabled for this conversation.</p><p id="pair-status" role="status">Preparing your private pairing…</p><div id="pair-link"></div><p class="privacy-note">Your phone microphone starts only with your consent. Direct mode sends audio to Amazon Bedrock; hands-free mode transcribes room audio with Amazon Transcribe and screens transcripts through Jev via OpenRouter before accepted words reach Sonic. Pip’s voice plays here. Unjoined QR links expire after fifteen minutes; connected pairing stays active until disconnected.</p><button id="pair-home" class="primary-button" hidden>Enjoy our home</button>');
  stopSpeech();
  const pairing = new PhonePairing(pairingCallbacks()); phonePairing = pairing;
  try {
    const room = await pairing.host({ mode, cowatch:coWatch, name: state.name, day: state.day, voice: state.voice, viewer: viewerContext(), memories: state.remember ? state.memories : [], recentConversation: history, world: { garden: state.garden, atmosphere: state.atmosphere, vibe: state.vibe, window: state.window, storyPath: state.storyPath } });
    if (!room || phonePairing !== pairing) return;
    if (coWatch && movieNight.token && !movieNight.nativeControl) pairing.send({type:'delegate-tv',token:movieNight.token});
    if (lastMoviePick) setTimeout(() => pairing.moviePick(lastMoviePick), 250);
    if (coWatch) {element('panel-kicker').textContent = 'YOUR MOVIE COMPANION'; document.querySelector('#panel-content .privacy-note').textContent = 'Pip’s voice plays on your phone so the conversation can continue when the TV changes apps. Keep the phone page open. Starting its microphone sends speech to the configured voice services. TV controls require an active Hearth player or an authorized remote bridge.';}
    element('pair-link').innerHTML = `<img width="220" height="220" src="${escapeHtml(room.qr)}" alt="Scan to connect your phone"><p><a href="${escapeHtml(room.joinUrl)}" target="_blank" rel="noopener">Open phone microphone</a></p>`;
    element('pair-status').textContent = 'Waiting for your phone…';
    element('pair-home').hidden = false;
    element('pair-home').onclick = () => {
      keepVoiceOnClose = true; closePanel();
      const status = document.createElement('div'); status.id = 'live-status'; status.className = 'live-home-status'; status.textContent = 'Your phone is Pip’s microphone.'; document.querySelector('.world').append(status);
      element('choices').replaceChildren();
      const end = document.createElement('button'); end.textContent = 'End phone conversation'; end.onclick = () => { stopLiveVoice(); quietCompany(); }; element('choices').append(end);
    };
  } catch (error) { pairing.stop(); if (element('pair-status')) element('pair-status').textContent = error.message; }
}

function joinPhone(token) {
  openPanel('PIP’S PHONE MICROPHONE', '<h2>Your voice. Their little home.</h2><p id="phone-output">Keep this phone near you. Pip’s voice plays on the television.</p><p id="pair-status" role="status">Connecting to your television…</p><p id="pair-caption" aria-live="polite"></p><div class="panel-actions"><button id="phone-start" class="primary-button">Start microphone</button><button id="phone-mute" class="subtle-button" hidden>Pause microphone</button><button id="phone-end" class="subtle-button">End connection</button></div><div id="phone-watch" hidden><h3>Our movie night</h3><p id="phone-playback" role="status"></p><div class="panel-actions"><button id="phone-pause" class="subtle-button">Pause TV</button><button id="phone-play" class="subtle-button">Resume TV</button><button id="phone-return" class="subtle-button">Return to Hearth</button></div><p id="phone-control-result" role="status"></p><form id="phone-text-form"><label class="field">Say something to Pip<input id="phone-text" maxlength="500" placeholder="What did you think of that?"></label><button type="submit" class="subtle-button">Tell Pip</button></form></div><p class="privacy-note">Starting sends microphone audio and the TV’s enabled conversation context to Amazon Bedrock. Hearth does not record your audio. Closing this screen stops the microphone.</p>');
  const pairing = new PhonePairing(pairingCallbacks()); phonePairing = pairing; pairing.connect(token);
  pairing.onContext = context => {
    if (!context.cowatch) return;
    element('phone-watch').hidden = false; element('phone-output').textContent = 'Pip’s voice plays on this phone and stays here while another TV app is open. Keep this page open.';
    const shelf = document.createElement('div');shelf.className='panel-actions';shelf.id='phone-film-shelf';
    for (const film of FILMS.filter(item=>item.src)) {const button=document.createElement('button');button.className='subtle-button';button.dataset.film=film.id;button.textContent=`Play ${film.title} on TV`;button.onclick=async()=>{const reply=await pairing.requestControl({action:'title',id:film.id});element('phone-control-result').textContent=reply.summary;};shelf.append(button);}
    element('phone-watch').append(shelf);
    const state=document.createElement('p');state.id='phone-tv-state';state.textContent='TV companion connected. Pip’s audio stays on this phone.';element('phone-watch').prepend(state);
    const discover=document.createElement('button');discover.id='phone-discover';discover.className='subtle-button';discover.textContent='Discover TV media apps';discover.onclick=async()=>{const reply=await pairing.requestControl({action:'providers'});element('phone-control-result').textContent=reply.summary+(reply.endpoints?.length ? ' '+reply.endpoints.map(e=>e.packageId).join(', ') : '');};element('phone-watch').append(discover);
  };
  pairing.onHostState = active => {if (element('phone-tv-state')) element('phone-tv-state').textContent=active ? 'TV companion connected. Pip’s audio stays on this phone.' : 'TV companion is in the background. Pip stays with you on this phone.';};
  pairing.onMoviePick = pick => {
    if (!element('phone-watch')) return;
    element('phone-watch').hidden = false;
    let card = element('phone-pick-card');
    if (!card) {
      card = document.createElement('article');
      card.id = 'phone-pick-card';
      card.style.cssText = 'margin:10px 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(245,185,99,0.5);background:rgba(245,185,99,0.1);';
      element('phone-watch').prepend(card);
    }
    const films = (pick.picks || []).map(filmById).filter(Boolean);
    const primary = films[0];
    card.innerHTML = `<small style="color:#f5b963;font-weight:700;letter-spacing:0.08em">PIP’S PICK SENT TO YOUR PHONE</small><h4 style="margin:4px 0">${escapeHtml(primary ? primary.title : 'Tonight’s recommendation')}</h4><p style="margin:4px 0 8px;font-size:14px">${escapeHtml(pick.text || '')}</p><div class="panel-actions" id="phone-pick-actions"></div>`;
    const actions = card.querySelector('#phone-pick-actions');
    for (const film of films.slice(0, 2)) {
      if (film.src) {
        const btn = document.createElement('button');
        btn.className = 'primary-button';
        btn.textContent = `Watch ${film.title} on TV`;
        btn.onclick = async () => { const reply = await pairing.requestControl({ action: 'title', id: film.id }); element('phone-control-result').textContent = reply.summary; };
        actions.append(btn);
      } else {
        const link = document.createElement('a');
        link.className = 'subtle-button';
        link.href = `https://www.amazon.com/s?k=${encodeURIComponent(film.title)}&i=instant-video`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `Open ${film.title} on Prime`;
        actions.append(link);
      }
    }
  };
  pairing.onPlayback = playback => { if (element('phone-playback')) element('phone-playback').textContent = playback ? `${playback.title} · ${playback.status} · ${Math.floor(playback.positionSeconds / 60)}:${String(playback.positionSeconds % 60).padStart(2,'0')}` : 'No current player telemetry. Prime progress is available only if its provider reports it.'; };
  for (const action of ['pause','play','return']) element(`phone-${action}`).onclick = async () => { const result = await pairing.requestControl({action}); element('phone-control-result').textContent = result.summary; };
  element('phone-text-form').onsubmit = event => { event.preventDefault(); const input = element('phone-text'); pairing.voice?.submitText(input.value); input.value = ''; };
  const consent = document.createElement('p'); consent.className = 'privacy-note'; consent.textContent = 'For a hands-free pairing, ambient audio goes to Amazon Transcribe and transcripts go to Jev through OpenRouter—even when Pip stays quiet. Accepted turns go to Nova Sonic. Starting the microphone consents to this processing. Keep this page foregrounded; mute or end at any time. Connected pairing stays on until you end it or disconnect.'; element('panel-content').append(consent);
  pairing.microphoneEnded = () => { if (element('phone-start')) { element('phone-start').hidden = false; element('phone-mute').hidden = true; } };
  element('phone-start').onclick = async () => {
    element('phone-start').disabled = true;
    try { await pairing.microphone(); if (element('phone-start')) { element('phone-start').hidden = true; element('phone-mute').hidden = false; } }
    catch (error) { if (element('pair-status')) element('pair-status').textContent = error.message; }
    finally { if (element('phone-start')) element('phone-start').disabled = false; }
  };
  element('phone-mute').onclick = () => { element('phone-mute').textContent = pairing.voice.mute() ? 'Resume microphone' : 'Pause microphone'; };
  element('phone-end').onclick = () => { stopLiveVoice(); closePanel(); };
}

window.hearthVoiceResult = text => { if (element('talk-text')) { element('talk-text').value = text; element('voice-status').textContent = 'Check your words, then choose Tell Pip.'; } };
window.hearthVoiceUnavailable = () => toast('Voice recognition is unavailable on this device. Use the remote replies.');
window.hearthSpeaking = active => pip?.classList.toggle('speaking', active);

const demo = [
  { title: 'First, a little life.', text: 'Pip is tending the plants. The home carries on between conversations. Let’s tell Pip about a granddaughter’s recital.', action: recital },
  { title: 'A day later, a remembered moment.', text: 'Advance the day. Pip remembers the recital and asks about it when you return.', action: nextDay },
  { title: 'Your story changes the world.', text: 'Tell Pip she was wonderful. A drawing inspired by the recital appears on the wall.', action: recitalWentWell },
  { title: 'Room for a quieter feeling.', text: '“The house has been quiet lately.” Pip slows down and offers company or a small step toward connection.', action: quiet },
  { title: 'A bridge to someone you love.', text: 'Pip helps prepare a note. You control sharing it. Choose “We’ve arranged a call” only after arranging one yourself.', action: message },
  { title: 'A home with continuity.', text: 'Visit another day. If you confirmed a call, Pip asks how it went. Otherwise, the recital remains an open thread. The drawing stays on the wall.', action: nextDay }
];

function demoPanel() {
  if (!state.remember) { toast('Turn remembering on in Settings to try the persistent story demo.'); return; }
  if (demoStep < 0 || demoStep >= demo.length) demoStep = 0;
  const step = demo[demoStep];
  openPanel(`STORY DEMO · ${demoStep + 1} / ${demo.length}`, `<h2>${step.title}</h2><p>${step.text}</p><div class="story-progress">${demo.map((_, index) => `<span class="${index <= demoStep ? 'done' : ''}"></span>`).join('')}</div><div class="panel-actions"><button class="primary-button" id="play-step">${demoStep === demo.length - 1 ? 'See the next day' : 'See this moment'} →</button><button class="subtle-button" id="end-demo">End demo</button></div><p class="privacy-note">Guided story mode uses scripted dialogue and real local persistence. Steps advance when you choose. Your existing memories stay.</p>`);
  element('play-step').onclick = () => { const next = demoStep + 1; closePanel(); step.action(); demoStep = next; element('demo-button').textContent = next < demo.length ? `Continue story · ${next + 1} / ${demo.length} →` : 'Replay the story demo →'; };
  element('end-demo').onclick = home;
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const voice = liveVoice || phonePairing?.voice;
    const busyVoice = voice && (voice.mode !== 'ambient' || ['listening', 'thinking', 'speaking'].includes(pip?.dataset.presence));
    if (panel.open || document.hidden || busyVoice || characterActions?.active || storyAudio && !storyAudio.paused || pip?.classList.contains('speaking') || element('talk-button').disabled) { scheduleIdle(); return; }
    const activities = [ ['Pip is watching the garden', 'translate(650 455)', 'The light moves slowly across the room.', ''], ['Pip is warming up by the fire', 'translate(1060 468)', 'There’s always a little room by the fire.', 'pip-sipping'], ['Pip is tending the plants', 'translate(430 450)', 'A little water. A little patience.', ''], ['Pip is reading a little story', 'translate(570 468)', 'A few pages. A quiet afternoon.', 'pip-reading'] ];
    const activity = activities[Math.floor(Date.now() / 25000) % activities.length];
    element('activity-label').textContent = activity[0];
    element('pip-position')?.setAttribute('transform', activity[1]);
    element('scene-subtitle').textContent = activity[2];
    setMood('content');
    pip?.classList.add('pip-walking');
    if (activity[3]) pip?.classList.add(activity[3]);
    if (element('watering-can')) element('watering-can').style.opacity = activity[0].includes('plants') ? '1' : '0';
    scheduleIdle();
  }, 25000);
}

function clearInvitation() {
  clearTimeout(invitationTimer);
  element('pip-invitation')?.remove();
}

function scheduleInvitation() {
  clearTimeout(invitationTimer);
  if (invitationShown || !state.gentleInvitations || document.hidden) return;
  invitationTimer = setTimeout(() => {
    if (panel.open || document.hidden || liveVoice || phonePairing || pip?.classList.contains('speaking') || element('talk-button').disabled) { scheduleInvitation(); return; }
    const invitation = invitationFor(state);
    if (!invitation) return;
    invitationShown = true;
    const notice = document.createElement('section'); notice.id = 'pip-invitation'; notice.className = 'pip-invitation'; notice.setAttribute('aria-label', 'A gentle invitation from Pip');
    const words = document.createElement('p'); words.textContent = invitation.text; words.setAttribute('role', 'status'); notice.append(words);
    const actions = document.createElement('div'); actions.className = 'choices';
    const accept = document.createElement('button'); accept.textContent = invitation.label; accept.onclick = () => { clearInvitation(); ({ followup: home, game: room, garden })[invitation.action](); };
    const dismiss = document.createElement('button'); dismiss.textContent = 'Just enjoy the quiet'; dismiss.onclick = () => { clearInvitation(); element('home-button').focus(); };
    actions.append(accept, dismiss); notice.append(actions); document.querySelector('.interaction').after(notice);
  }, 90000);
}

function updateClock() {
  const now = new Date();
  element('clock').textContent = now.toLocaleDateString(undefined, { weekday: 'long' }) + ', ' + now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  element('day-label').textContent = `A quiet ${now.toLocaleDateString(undefined, { weekday: 'long' })}`;
  const evening = state.atmosphere === 'evening' || (state.atmosphere === 'auto' && (now.getHours() >= 18 || now.getHours() < 6));
  element('world-time').textContent = state.atmosphere === 'rain' ? 'RAIN AT THE WINDOW' : `${state.vibe === 'cold' ? 'CRISP & COLD' : 'WARM & COZY'} · ${state.window === 'open' ? 'WINDOW OPEN' : 'WINDOW CLOSED'}`;
  document.querySelector('.world').classList.toggle('evening', evening);
}

element('home-button').onclick = home;
element('cinema-button').onclick = () => cinema.show();
element('vibe-switch').onclick = () => { performWorldAction({ action: state.vibe === 'cozy' ? 'cold' : 'cozy' }); };
element('memories-button').onclick = memories;
element('room-button').onclick = room;
element('settings-button').onclick = settings;
element('talk-button').onclick = talk;
element('demo-button').onclick = demoPanel;
element('sound-button').onclick = () => {
  state.sound = !state.sound; save();
  if (state.sound) speak('Hello. It’s good to have you here.');
  else stopSpeech();
};
element('fullscreen-button').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('Fullscreen is unavailable in this browser.'); }
};

document.addEventListener('keydown', event => {
  const active = document.activeElement;
  if ((event.key === 'Escape' || event.key === 'BrowserBack') && panel.open) { event.preventDefault(); closePanel(); return; }
  if ((event.key === 'Escape' || event.key === 'BrowserBack') && cinema.stage) { event.preventDefault(); cinema.close(); return; }
  if ((event.key === 'Escape' || event.key === 'BrowserBack') && window.HearthNative?.exit) { event.preventDefault(); window.HearthNative.exit(); return; }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
  if (event.key === 'Enter' && active === document.body) { event.preventDefault(); talk(); return; }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const scope = panel.open ? panel : cinema.stage || document;
  const buttons = [...scope.querySelectorAll('button:not(:disabled),a[href],input,textarea,select')].filter(button => button.getClientRects().length && !button.hidden && (panel.open || !panel.contains(button)));
  if (!buttons.includes(active)) { buttons[0]?.focus(); return; }
  const current = active.getBoundingClientRect();
  const currentX = current.x + current.width / 2;
  const currentY = current.y + current.height / 2;
  const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
  const ranked = buttons.filter(button => button !== active).map(button => {
    const rect = button.getBoundingClientRect();
    const deltaX = rect.x + rect.width / 2 - currentX;
    const deltaY = rect.y + rect.height / 2 - currentY;
    const primary = (horizontal ? deltaX : deltaY) * direction;
    const secondary = Math.abs(horizontal ? deltaY : deltaX);
    return { button, primary, score: primary + secondary * 3 };
  }).filter(item => item.primary > 5).sort((first, second) => first.score - second.score);
  ranked[0]?.button.focus();
});

window.hearthRemote = key => {
  if (key === 'Back') { if (panel.open) { closePanel(); return; } if (cinema.stage) {cinema.close();return;} window.HearthNative?.exit(); return; }
  if (key === 'Enter') {
    const active = document.activeElement;
    if (active === document.body) { talk(); return; }
    if (active instanceof HTMLInputElement && active.type === 'checkbox') { active.click(); return; }
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) { active.focus(); window.HearthNative?.showKeyboard(); return; }
    active?.click(); return;
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

function suspendHome() {
  clearTimeout(idleTimer); clearInvitation(); characterActions?.stop(); firesideTune.stop(); recognition?.abort(); stopSpeech();
  if (phonePairing?.isHost && phonePairing.coWatch) { phonePairing.suspend(); liveVoice?.stop(); liveVoice=null; }
  else stopLiveVoice();
  cinema.video?.pause(); clearInterval(breathTimer); requestController?.abort();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendHome();
  else { phonePairing?.resume(); updateClock(); scheduleIdle(); scheduleInvitation(); }
});
window.hearthPause = suspendHome;
window.hearthResume = () => phonePairing?.resume();

for (const eventName of ['pointerdown', 'keydown']) document.addEventListener(eventName, () => { speechAllowed = true; if (!element('pip-invitation')) scheduleInvitation(); }, { passive: true, capture: true });

async function initialise() {
  configReady = fetch(`${backendUrl}/api/config`).then(response => response.ok ? response.json() : {}).then(config => { backendAvailable = config.dialogue === 'bedrock'; sonicAvailable = config.voice === 'nova-sonic'; attentionAvailable = config.attention === 'jev'; if (sonicAvailable) element('voice-hint').textContent = attentionAvailable ? 'Hands-free company, with room for quiet' : 'A cozy, natural conversation'; }).catch(() => {});
  if (window.HearthNative || new URLSearchParams(location.search).has('tv')) document.body.classList.add('tv');
  try {
    const response = await fetch('room.svg');
    if (!response.ok) throw new Error('Room unavailable');
    element('room-mount').innerHTML = await response.text();
    pip = element('pip');
    characterActions = new CharacterActions({ reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, character: pip, position: element('pip-position'), label: element('activity-label'), onChange: action => { if (element('watering-can')) element('watering-can').style.opacity = action === 'water' ? '1' : '0'; if (!action) { if (pip?.dataset.presence) voiceActivity(pip.dataset.presence); else element('activity-label').textContent = 'Pip is enjoying a quiet moment'; } } });
  } catch { element('room-mount').innerHTML = '<img class="room" src="room.svg" alt="Pip’s warm illustrated home">'; toast('The home is taking a moment to load. You can still talk with Pip.'); }
  updateClock();
  setInterval(updateClock, 60000);
  save();
  home();
  const joinToken = new URLSearchParams(location.search).get('join');
  if (joinToken && /^[a-f0-9-]{36}$/.test(joinToken)) joinPhone(joinToken);
  else if (new URLSearchParams(location.search).has('movies')) cinema.show();
}
initialise();
