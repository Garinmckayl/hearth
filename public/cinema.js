import { FILMS, filmById, rankFilms, primeSearch } from './film-catalog.js';

const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
export class Cinema {
  constructor({ openPanel, mount, backendUrl = '', onTurn = () => {}, onSpeak = () => {}, onPlayback = () => {}, onPrime = () => {}, onPair = () => {}, onTvControls = () => {}, onForget = () => {}, onClose = () => {} }) {
    Object.assign(this, { openPanel, mount, backendUrl, onTurn, onSpeak, onPlayback, onPrime, onPair, onTvControls, onForget, onClose });
    try { this.profile = JSON.parse(localStorage.getItem('hearth.cinema.v1') || '{}'); } catch { this.profile = {}; }
    this.profile.preferences = typeof this.profile.preferences === 'string' ? this.profile.preferences.slice(0, 500) : '';
    this.profile.history = Array.isArray(this.profile.history) ? this.profile.history.slice(-30) : [];
    this.profile.rememberProgress = this.profile.rememberProgress === true;
  }
  persist() { try { localStorage.setItem('hearth.cinema.v1', JSON.stringify(this.profile)); } catch { this.caption('This visit works, but viewing memory could not be saved.'); } }
  context(remember = true) { return { catalog: FILMS.map(({src, license, tags, color, ...film}) => film), ...(remember ? {preferences: this.profile.preferences, history: this.profile.history.slice(-8)} : {}), playback: this.snapshot() }; }
  snapshot() { return this.film && this.video ? { id: this.film.id, title: this.film.title, provider: 'Hearth Cinema', status: this.video.error ? 'ERROR' : this.video.ended ? 'ENDED' : this.video.paused ? 'PAUSED' : 'PLAYING', positionSeconds: Math.round(this.video.currentTime || 0), durationSeconds: Number.isFinite(this.video.duration) ? Math.round(this.video.duration) : null, sampledAt: Date.now() } : null; }
  caption(text) { const node = this.stage?.querySelector('#cinema-caption'); if (node) node.textContent = text; }
  async ask(text, { status, recommendations } = {}) {
    const sequence = this.askSequence = (this.askSequence || 0) + 1;
    if (status) status.textContent = 'Pip is considering tonight’s film…';
    try {
      const response = await fetch(`${this.backendUrl}/api/movie-night`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text, preferences: this.profile.preferences, history: this.profile.history.slice(-8), playback: this.snapshot()}) });
      if (!response.ok) throw new Error('Movie conversation unavailable');
      const reply = await response.json();
      if (sequence !== this.askSequence) return;
      if (status) status.textContent = reply.text;
      this.caption(reply.text);
      if (recommendations) this.renderShelf(recommendations, reply.picks.map(filmById).filter(Boolean));
      this.onSpeak?.(reply.text);
      return reply;
    } catch {
      if (sequence !== this.askSequence) return;
      const picks = rankFilms(text + ' ' + this.profile.preferences, {history:this.profile.history});
      const message = `Live AI is unavailable. From our shelf, try ${picks[0].title}: ${picks[0].opinion}`;
      if (status) status.textContent = message;
      if (recommendations) this.renderShelf(recommendations, picks);
      this.caption(message);
      return {text:message, picks:picks.slice(0,3).map(f=>f.id), source:'local-shelf'};
    }
  }
  show() {
    this.openPanel('MOVIE NIGHT WITH PIP', `<div class="cinema-intro"><p class="eyebrow">YOUR TASTE. HER OPINIONS.</p><h2>What are we watching tonight?</h2><p>A little comedy, a proper adventure, or something completely your own.</p></div><form id="cinema-find"><label class="field">What are you in the mood for?<input id="cinema-mood" maxlength="500" placeholder="Something funny, short, and not too dark" value="${escape(this.profile.preferences)}"></label><div class="panel-actions"><button class="primary-button" type="submit">Pip, choose with me</button><button class="subtle-button" type="button" id="cinema-save">Remember my taste</button></div></form><p id="cinema-advice" role="status">Two open-film choices play here. Prime choices open a search; access depends on your account and region.</p><div id="cinema-shelf" class="cinema-shelf"></div><div class="panel-actions"><button class="subtle-button" id="cinema-phone">Keep Pip with me on my phone</button><button class="subtle-button" id="cinema-forget">Forget my movie memories</button></div><label class="setting-row"><input type="checkbox" id="cinema-remember" ${this.profile.rememberProgress ? 'checked' : ''}> Remember my playback position and completed films on this device</label><p class="privacy-note">Open films: Blender Foundation, CC BY 3.0. Prime search choices are suggestions, not verified included titles. Keep the phone page open for companion audio while another TV app is playing.</p>`);
    const shelf = document.getElementById('cinema-shelf');
    this.renderShelf(shelf, rankFilms(this.profile.preferences, {history:this.profile.history}));
    document.getElementById('cinema-find').onsubmit = event => { event.preventDefault(); this.ask(document.getElementById('cinema-mood').value || 'Pick something for tonight.', {status:document.getElementById('cinema-advice'), recommendations:shelf}); };
    document.getElementById('cinema-save').onclick = () => { this.profile.preferences = document.getElementById('cinema-mood').value.trim(); this.persist(); document.getElementById('cinema-advice').textContent = 'Your movie taste is saved on this device.'; this.onTurn(`I explicitly saved my movie preferences: ${this.profile.preferences}`); };
    document.getElementById('cinema-remember').onchange = event => { this.profile.rememberProgress = event.target.checked; if (!event.target.checked) this.profile.history = []; this.persist(); };
    document.getElementById('cinema-forget').onclick = () => { this.profile = {preferences:'', history:[], rememberProgress:false}; this.persist(); this.onForget(); this.show(); };
    document.getElementById('cinema-phone').onclick = () => this.onPair();
    const controls = document.createElement('button');controls.id='cinema-tv-controls';controls.className='subtle-button';controls.textContent='Connected TV app controls';controls.onclick=()=>this.onTvControls();document.getElementById('cinema-phone').after(controls);
  }
  renderShelf(root, films) {
    root.replaceChildren();
    for (const film of films) {
      const card = document.createElement('article'); card.className = 'film-card'; card.dataset.film = film.id; card.style.setProperty('--film-color', film.color);
      card.innerHTML = `<div class="film-art" aria-hidden="true"><span>${film.kind === 'search' ? '↗' : '▶'}</span><small>${film.kind === 'trailer' ? 'TRAILER' : film.src ? 'OPEN FILM' : 'PRIME SEARCH'}</small></div><div class="film-info"><h3>${escape(film.title)}</h3><small>${film.year} · ${film.minutes} min · ${escape(film.genres)}</small><p>${escape(film.opinion)}</p><button class="${film.src ? 'primary-button' : 'subtle-button'}">${film.src ? 'Watch with Pip' : 'Find on Prime Video'}</button></div>`;
      card.querySelector('button').onclick = () => film.src ? this.watch(film) : this.confirmPrime(film);
      root.append(card);
    }
  }
  confirmPrime(film) {
    this.openPanel('OVER TO PRIME VIDEO', `<h2>${escape(film.title)}</h2><p>${escape(film.description)}</p><p>Open a Prime Video search for this title. Check availability, price, and the edition before playing.</p><div class="panel-actions"><button class="primary-button" id="cinema-prime-confirm">Open Prime Video search</button><button class="subtle-button" id="cinema-prime-cancel">Keep choosing</button></div><p id="cinema-prime-status" role="status"></p><p>Pair your phone first to keep talking with Pip after leaving Hearth. Native TV playback controls depend on the installed provider; Fire OS control requires the connected owner bridge.</p><button class="subtle-button" id="cinema-prime-phone">Pair my phone first</button>`);
    document.getElementById('cinema-prime-cancel').onclick = () => this.show();
    document.getElementById('cinema-prime-phone').onclick = () => this.onPair();
    document.getElementById('cinema-prime-confirm').onclick = async () => {
      const status = document.getElementById('cinema-prime-status');
      const result = await this.onPrime(film, film.id === 'prime' ? 'https://www.primevideo.com/' : primeSearch(film.title));
      status.textContent = result.summary;
      this.onTurn(`Prime handoff result for ${film.title}: ${result.summary}`);
    };
    return {ok:true, summary:`The viewer can confirm a Prime Video search for ${film.title}. No app has opened and no playback has started.`};
  }
  async watch(film) {
    this.close(false);
    this.film = film;
    this.openPanel('OUR MOVIE NIGHT', '<p>The film is starting…</p>');
    document.getElementById('panel').close();
    const stage = document.createElement('section'); stage.className = 'cinema-stage'; stage.id = 'cinema-stage'; stage.setAttribute('aria-label','Movie night player');
    stage.innerHTML = `<header class="cinema-top"><div><span class="eyebrow">HEARTH CINEMA · WATCHING TOGETHER</span><h2>${escape(film.title)}</h2></div><button id="cinema-exit" class="subtle-button">Back to our home</button></header><div class="cinema-screen"><video id="cinema-video" playsinline preload="metadata" aria-label="${escape(film.title)} player"></video><aside class="cinema-pip"><img src="pip.svg" alt="Pip, your movie companion"><div><strong>PIP</strong><p id="cinema-caption">${escape(film.opinion)}</p></div></aside></div><div class="cinema-transport"><button id="cinema-pause" class="primary-button">Pause film</button><button id="cinema-rewind" class="subtle-button">Back 10 seconds</button><span id="cinema-time" aria-live="off">0:00</span><button id="cinema-pair" class="subtle-button">Phone companion</button><label><input id="cinema-comments" type="checkbox" checked> Pip’s little comments</label></div><form id="cinema-chat"><label class="field">Talk about the film<input id="cinema-question" maxlength="500" placeholder="Pip, why did you choose this one?"></label><button type="submit" class="subtle-button">Ask Pip</button></form><p id="cinema-answer" role="status"></p><small class="cinema-credit">${escape(film.credit)} · <a href="${film.license}" target="_blank" rel="noopener">License</a></small>`;
    document.body.append(stage); this.stage = stage; this.video = stage.querySelector('video');
    this.video.src = film.src;
    const saved = this.profile.rememberProgress && this.profile.history.find(entry => entry.id === film.id && !entry.completed);
    this.video.addEventListener('loadedmetadata', () => { if (saved?.positionSeconds > 0 && saved.positionSeconds < this.video.duration - 5) this.video.currentTime = saved.positionSeconds; });
    for (const event of ['play','pause','ended','seeked','error']) this.video.addEventListener(event, () => this.changed(event));
    this.video.addEventListener('timeupdate', () => { stage.querySelector('#cinema-time').textContent = `${clock(this.video.currentTime)} / ${clock(this.video.duration)}`; if (Date.now() - (this.lastSnapshot || 0) > 10000) { this.lastSnapshot = Date.now(); this.remember(); this.onPlayback(this.snapshot()); } });
    stage.querySelector('#cinema-pause').onclick = () => this.control(this.video.paused ? 'play' : 'pause');
    stage.querySelector('#cinema-rewind').onclick = () => { this.video.currentTime = Math.max(0, this.video.currentTime - 10); };
    stage.querySelector('#cinema-exit').onclick = () => this.close();
    stage.querySelector('#cinema-pair').onclick = () => this.onPair();
    stage.querySelector('#cinema-chat').onsubmit = event => { event.preventDefault(); const input = stage.querySelector('#cinema-question'); if (input.value.trim()) this.ask(input.value.trim(), {status:stage.querySelector('#cinema-answer')}); input.value = ''; };
    try { await this.video.play(); } catch { this.caption('Choose Resume film to start playback.'); stage.querySelector('#cinema-pause').textContent = 'Resume film'; }
    stage.querySelector('#cinema-pause').focus();
    return {ok:!this.video.error, summary:`${film.title} player is ${this.video.paused ? 'paused' : 'playing'} in Hearth Cinema. This is an open Blender film, not Prime Video.`, playback:this.snapshot()};
  }
  changed(event) {
    if (!this.video) return;
    this.stage.querySelector('#cinema-pause').textContent = this.video.paused ? 'Resume film' : 'Pause film';
    if (this.stage.querySelector('#cinema-comments').checked) this.caption(event === 'ended' ? 'That’s our film. What stayed with you? Tell me what you thought.' : event === 'pause' ? 'A little intermission. Want to talk about it?' : event === 'play' ? 'I’m here. Let’s settle in.' : event === 'error' ? 'The film could not load. We can choose another.' : 'Back to that moment.');
    this.remember(); this.onPlayback(this.snapshot());
  }
  remember() {
    if (!this.video || !this.profile.rememberProgress || this.video.error) return;
    const snapshot = this.snapshot();
    this.profile.history = [...this.profile.history.filter(entry=>entry.id!==this.film.id), {...snapshot, completed:this.video.ended, at:new Date().toISOString()}].slice(-30); this.persist();
  }
  async control(action) {
    if (!this.video) return {ok:false, summary:'No Hearth Cinema film is open.'};
    if (action === 'status') return {ok:!this.video.error, summary:JSON.stringify(this.snapshot()), playback:this.snapshot()};
    if (action === 'pause') this.video.pause();
    else if (action === 'play') { try { await this.video.play(); } catch { return {ok:false, summary:'The player could not start. Choose Resume film on the TV.'}; } }
    else if (action === 'stop') { this.video.pause(); this.video.currentTime = 0; }
    else if (action === 'return') { this.close(); return {ok:true, summary:'The Hearth Cinema film stopped and Pip’s home is visible.'}; }
    else return {ok:false, summary:'Unsupported player action.'};
    return {ok:!this.video.error, summary:`${this.film.title}: ${this.video.paused ? 'PAUSED' : 'PLAYING'} at ${clock(this.video.currentTime)}.`, playback:this.snapshot()};
  }
  action(action, text) {
    if (action === 'tv-prime') return this.confirmPrime({id:'prime',title:'Prime Video',description:'Browse Prime Video on the TV. Choose a title and check account access before playing.'});
    if (action === 'movie-night') { this.show(); return {ok:true, summary:'The movie shelf is open. Recommend from its supplied catalog; open films play here and Prime choices launch a search after confirmation.'}; }
    if (action === 'tv-title') { const film = filmById(text); if (!film) return null; if (!film.src) return this.confirmPrime(film); this.openPanel('PIP’S PICK', `<h2>${escape(film.title)}</h2><p>${escape(film.description)}</p><button class="primary-button" id="cinema-confirm-watch">Watch with Pip</button>`); document.getElementById('cinema-confirm-watch').onclick = () => this.watch(film); return {ok:true, summary:`A Watch with Pip confirmation for ${film.title} is visible. No film has started yet.`}; }
    if (this.video && ['tv-status','tv-pause','tv-play','tv-stop','tv-return'].includes(action)) return this.control(action.slice(3));
    return null;
  }
  close(notify = true) {
    if (this.video) { this.remember(); this.video.pause(); this.video.removeAttribute('src'); this.video.load(); }
    this.stage?.remove(); this.stage = null; this.video = null; this.film = null;
    this.onPlayback(null); if (notify) this.onClose();
  }
}
