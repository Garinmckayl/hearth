export const TV_ACTIONS = ['movie-night', 'tv-status', 'tv-prime', 'tv-title', 'tv-pause', 'tv-play', 'tv-stop', 'tv-back', 'tv-return'];

export class MovieNight {
  constructor({ backendUrl = '', openPanel, mount, onTurn = () => {}, onForget = () => {} }) {
    Object.assign(this, { backendUrl, openPanel, mount, onTurn, onForget });
    this.token = ''; this.viewer = null; this.catalog = [];
    this.nativeControl = typeof window !== 'undefined' ? window.HearthNative?.tvControl : null;
    this.endpoints = []; this.endpoint = '';
  }
  context(remember = true) {
    return { controlUnlocked: Boolean(this.token), catalog: this.catalog.slice(0, 20), ...(remember && this.viewer ? { preferences: this.viewer.preferences, history: this.viewer.history.slice(-8) } : {}) };
  }
  async request(command) {
    if (!this.token) return { ok: false, summary: 'TV control is locked. Open Movie night and unlock the owner-authorized bridge first.' };
    try {
      if (this.nativeControl) {
        const key = 'hearth.viewer.v1';
        const raw = JSON.parse(localStorage.getItem(key) || '{}');
        const profile = { preferences: typeof raw.preferences === 'string' ? raw.preferences.slice(0, 1000) : '', history: Array.isArray(raw.history) ? raw.history.filter(entry => entry && typeof entry.title === 'string' && typeof entry.at === 'string' && ['viewer-review', 'launch-request', 'provider-snapshot'].includes(entry.type)).slice(-50) : [] };
        if (command.action === 'profile') return { ok: true, profile, catalog: this.catalog };
        if (command.action === 'forget') { localStorage.removeItem(key); return { ok: true, summary: 'Viewing profile deleted from this TV browser profile.' }; }
        if (command.action === 'remember-state') {
          if (!this.endpoint) return { ok: false, summary: 'Select a discovered media app first.' };
          const current = await this.nativeControl({ action: 'status' });
          const endpoint = current.ok && current.endpoints?.find(entry => entry.packageId === this.endpoint);
          if (!endpoint?.sessions.length) return { ok: false, summary: 'The selected provider did not return session state. Nothing was saved.' };
          profile.history.push({ type: 'provider-snapshot', title: `${endpoint.packageId}: ${JSON.stringify(endpoint.sessions)}`.slice(0, 1000), at: new Date().toISOString() });
          localStorage.setItem(key, JSON.stringify({ ...profile, history: profile.history.slice(-50) }));
          return { ok: true, summary: 'Saved the provider’s sampled playback state with your permission—not a complete watch history or a guaranteed exact stopping point.' };
        }
        if (['preferences', 'review'].includes(command.action)) {
          if (typeof command.text !== 'string' || !command.text.trim() || command.text.length > 1000) return { ok: false, summary: 'Enter between 1 and 1000 characters.' };
          if (command.action === 'preferences') profile.preferences = command.text.trim();
          else profile.history.push({ type: 'viewer-review', title: command.text.trim(), at: new Date().toISOString() });
          localStorage.setItem(key, JSON.stringify({ ...profile, history: profile.history.slice(-50) }));
          return { ok: true, summary: 'Your viewing memory was explicitly saved on this TV.' };
        }
        const result = await this.nativeControl(command);
        if (command.action === 'status' && result.ok) { this.endpoints = result.endpoints || []; this.catalog = result.catalog || []; }
        if (command.action === 'title' && result.ok) {
          const entry = this.catalog.find(item => item.id === command.id);
          if (entry) {
            profile.history.push({ type: 'launch-request', title: entry.title, at: new Date().toISOString() });
            try { localStorage.setItem(key, JSON.stringify({ ...profile, history: profile.history.slice(-50) })); }
            catch { return { ...result, summary: `${result.summary} Local history could not be saved.` }; }
          }
        }
        return result;
      }
      const response = await fetch(`${this.backendUrl}/api/tv`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: this.token, command }) });
      const result = await response.json();
      return result.summary || result.ok ? result : { ok: false, summary: result.error || 'TV control is unavailable.' };
    } catch { return { ok: false, summary: 'The TV bridge could not be reached. No action is confirmed.' }; }
  }
  async refresh() {
    const result = await this.request({ action: 'profile' });
    if (result.ok) { this.viewer = result.profile; this.catalog = result.catalog; }
    return result;
  }
  show() {
    this.openPanel('MOVIE NIGHT WITH PIP', `<h2>Your taste. My extremely strong opinions.</h2><p>Find something worth watching, open a supported app, and make a night of it.</p><div id="movie-night-controls"></div><p class="privacy-note">${this.nativeControl ? 'Native Vega Media Controls: discover real media endpoints, select one, then confirm playback commands. Approved app links open only if an installed app handles them. Prime Video is not assumed available.' : 'Developer bridge: a separately authorized Fire OS device is required.'} This is not a Prime Video watch-history API. Launching another app can pause Hearth and its voice connection. Pip cannot see or hear protected video.</p>`);
    const root = document.getElementById('movie-night-controls');
    const status = document.createElement('p'); status.id = 'tv-status'; status.setAttribute('role', 'status'); root.append(status);
    const field = (label, multiline = false) => {
      const wrapper = document.createElement('label'); wrapper.className = 'field'; wrapper.textContent = label;
      const input = document.createElement(multiline ? 'textarea' : 'input'); input.maxLength = 1000; wrapper.append(input); root.append(wrapper); return input;
    };
    const button = (label, handler) => {
      const control = document.createElement('button'); control.className = 'subtle-button'; control.textContent = label;
      control.onclick = async () => { control.disabled = true; try { const result = await handler(); if (result?.summary) status.textContent = result.summary; } finally { control.disabled = false; } }; root.append(control); return control;
    };
    if (!this.token) {
      if (this.nativeControl) {
        status.textContent = 'Native Vega controls are available but not enabled. No playback has changed.';
        button('Enable Vega TV controls this session', async () => {
          this.token = 'native-session';
          const result = await this.request({ action: 'status' });
          if (!result.ok) { this.token = ''; status.textContent = result.summary; }
          else { await this.refresh(); this.show(); }
        });
        return;
      }
      status.textContent = 'TV control is locked. No connected TV or playback is assumed.';
      const password = field('Owner bridge key'); password.type = 'password'; password.autocomplete = 'off';
      button('Unlock this session', async () => {
        this.token = password.value; password.value = '';
        const result = await this.refresh();
        if (!result.ok) { this.token = ''; status.textContent = result.summary; }
        else this.show();
      });
      return;
    }
    status.textContent = this.nativeControl ? `Vega controls enabled. Found ${this.endpoints.length} media endpoint(s). Choose an app explicitly before playback control. Viewing memory stays in this TV browser profile; enabled remembering includes it in the next voice session.` : 'Unlocked for this page session. Each TV command needs your confirmation. Profile is stored on the backend, separately from home memories. Enabled remembering includes it in your next voice session. The bridge key is never saved or sent to AI.';
    button('Check TV connection', async () => { const result = await this.request({ action: 'status' }); if (this.nativeControl && result.ok) this.show(); else status.textContent = result.summary; });
    if (this.nativeControl) {
      const label = document.createElement('label'); label.className = 'field'; label.textContent = 'Media app to control';
      const select = document.createElement('select'); select.setAttribute('aria-label', 'Media app to control');
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Choose a discovered media app'; select.append(empty);
      for (const entry of this.endpoints) { const option = document.createElement('option'); option.value = entry.packageId; option.textContent = `${entry.packageId} · ${entry.sessions.map(session => `${session.status}${session.positionSeconds !== null ? ` at ${session.positionSeconds}s` : ''}`).join(', ') || 'state unavailable'}`; select.append(option); }
      select.value = this.endpoint; select.onchange = () => { this.endpoint = select.value; };
      label.append(select); root.append(label);
      button('Remember this playback snapshot', async () => { const result = await this.request({ action: 'remember-state' }); if (result.ok) await this.refresh(); return result; });
    }
    const preferences = field('What makes a good watch for you? Save only what you want Pip to remember.', true); preferences.value = this.viewer?.preferences || '';
    button('Save my viewing preferences', async () => {
      const result = await this.request({ action: 'preferences', text: preferences.value }); status.textContent = result.summary;
      if (result.ok) { await this.refresh(); this.onTurn(`I explicitly saved these viewing preferences: ${this.viewer.preferences}`); }
    });
    for (const [action, label] of [['prime', 'Open Prime Video'], ['pause', 'Pause playback'], ['play', 'Resume playback'], ['stop', 'Stop playback'], ['back', 'Back on the TV'], ['return', 'Return to Hearth']].filter(([action]) => !this.nativeControl || !['back', 'return'].includes(action))) button(label, () => this.confirm({ action }, label));
    const shelf = document.createElement('h3'); shelf.textContent = 'Our watchlist'; root.append(shelf);
    if (!this.catalog.length) { const empty = document.createElement('p'); empty.textContent = 'No verified title links configured yet. Add titles to the owner catalog; Pip will not invent availability or playback links.'; root.append(empty); }
    for (const entry of this.catalog) button(`${entry.title}${entry.minutes ? ` · ${entry.minutes} min` : ''}${entry.genres ? ` · ${entry.genres}` : ''}`, () => this.confirm({ action: 'title', id: entry.id }, `Open ${entry.title}`));
    const review = field('How was it? Your reaction, or where you remember stopping.', true);
    button('Remember my reaction', async () => {
      const result = await this.request({ action: 'review', text: review.value }); status.textContent = result.summary;
      if (result.ok) { await this.refresh(); this.onTurn(`My own report about our viewing: ${review.value}`); }
    });
    const history = document.createElement('p'); history.textContent = this.viewer?.history.length ? `Recent sessions: ${this.viewer.history.slice(-5).map(entry => `${entry.type === 'launch-request' ? 'Requested' : entry.type === 'provider-snapshot' ? 'Provider snapshot' : 'You said'}: ${entry.title}`).join(' · ')}` : 'No watch sessions saved. Launch requests are not proof of watching.'; root.append(history);
    button('Delete my viewing profile', async () => { this.confirmForget(status); });
    button('Lock TV controls', () => { this.token = ''; this.viewer = null; this.catalog = []; this.mount.querySelector('#tv-confirmation')?.remove(); this.show(); });
  }
  confirmForget(status) {
    const result = this.confirm({ action: 'forget' }, 'Delete saved preferences and history');
    status.textContent = result.summary;
  }
  confirm(command, label) {
    if (!this.token) return { ok: false, summary: 'TV controls are locked. Unlock Movie night first.' };
    if (this.nativeControl && ['back', 'return'].includes(command.action)) return { ok: false, summary: 'The Vega adapter does not provide global Back or return navigation. Use the platform controls.' };
    if (this.nativeControl && ['play', 'pause', 'stop'].includes(command.action)) {
      if (!this.endpoint) return { ok: false, summary: 'Select a discovered media app in Movie night before playback control.' };
      command = { ...command, endpoint: this.endpoint };
    }
    this.mount.querySelector('#tv-confirmation')?.remove();
    const card = document.createElement('section'); card.className = 'companion-activity'; card.id = 'tv-confirmation';
    const title = document.createElement('h3'); title.textContent = label;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Your permission first. Nothing has happened on the TV yet.';
    const controls = document.createElement('div'); controls.className = 'activity-controls';
    const yes = document.createElement('button'); yes.textContent = 'Confirm';
    const no = document.createElement('button'); no.textContent = 'Cancel'; no.onclick = () => card.remove();
    yes.onclick = async () => {
      yes.disabled = true; no.disabled = true;
      const result = await this.request(command); status.textContent = result.summary;
      if (result.ok) await this.refresh();
      if (result.ok && command.action === 'forget') { this.viewer = null; this.onForget(); }
      this.onTurn(`TV command result for ${label}: ${result.summary}`);
      yes.remove(); no.disabled = false; no.textContent = 'Dismiss';
      no.focus();
    };
    controls.append(yes, no); card.append(title, status, controls);
    const panelRoot = document.querySelector('#panel[open] #panel-content');
    (panelRoot || this.mount).append(card); yes.focus();
    return { ok: true, summary: `A confirmation card for ${label} is displayed. NO TV command has run. Wait for the person to confirm on screen; do not say it has opened, paused, played, or been deleted.` };
  }
  action(action, text) {
    if (action === 'movie-night') { this.show(); return { ok: true, summary: 'Opened Movie night controls. No TV app or playback was changed. Controls may still be locked.' }; }
    if (action === 'tv-status') return this.request({ action: 'status' }).then(result => {
      if (!result.ok || !this.nativeControl) return result;
      const selected = result.endpoints?.find(entry => entry.packageId === this.endpoint);
      return { ok: true, summary: selected ? `Selected provider ${selected.packageId} reports: ${selected.sessions.map(session => `${session.title || 'untitled session'}: ${session.status}, sampled position ${session.positionSeconds ?? 'unavailable'} seconds, sample timestamp ${session.sampledAtSeconds ?? 'unavailable'}`).join('; ') || 'no session state'}. Sampled telemetry is not a complete watch history.`.slice(0, 1000) : `${result.summary} No media app is selected; ask the viewer to select one in Movie night.` };
    });
    if (action === 'tv-title') {
      const title = this.catalog.find(entry => entry.id === text || entry.title.toLowerCase() === text?.toLowerCase());
      if (!title) return { ok: false, summary: 'That title is not in the configured catalog. Ask the viewer to add a verified title link; do not invent an ID.' };
      return this.confirm({ action: 'title', id: title.id }, `Open ${title.title}`);
    }
    return this.confirm({ action: action.slice(3) }, action === 'tv-return' ? 'Return to Hearth (not force-stop)' : `${action.slice(3)} on your TV`);
  }
}
