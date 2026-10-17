import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { filmById, primeSearch } from '../public/film-catalog.js';

const runFile = promisify(execFile);
const keys = { play: '126', pause: '127', stop: '86', back: '4' };

export function createTvController({ env = process.env, run = runFile, now = Date.now } = {}) {
  const token = env.HEARTH_TV_TOKEN || '';
  const serial = env.HEARTH_TV_ADB_SERIAL || '';
  const primePackage = env.HEARTH_TV_PRIME_PACKAGE || '';
  const expires = Date.parse(env.HEARTH_TV_EXPIRES_AT || '');
  const enabled = env.HEARTH_TV_ENABLED === 'true' && token.length >= 32 && /^[\w.:-]{1,100}$/.test(serial) && Number.isFinite(expires);
  const profileFile = env.HEARTH_TV_PROFILE_FILE || path.resolve('data/viewer.json');
  let busy = false;

  function authorized(value) {
    const supplied = Buffer.from(typeof value === 'string' ? value : '');
    const expected = Buffer.from(token);
    return enabled && expires > now() && supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  async function catalog() {
    if (!env.HEARTH_TV_CATALOG_FILE) return [];
    const entries = JSON.parse(await readFile(env.HEARTH_TV_CATALOG_FILE, 'utf8'));
    if (!Array.isArray(entries) || entries.length > 100) throw new Error('Invalid catalog');
    return entries.map(entry => {
      if (!entry || !/^[A-Z0-9]{10}$/.test(entry.id) || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 160) throw new Error('Invalid catalog title');
      return { id: entry.id, title: entry.title, genres: typeof entry.genres === 'string' ? entry.genres.slice(0, 160) : '', minutes: Number.isInteger(entry.minutes) && entry.minutes > 0 && entry.minutes < 1000 ? entry.minutes : null };
    });
  }
  async function profile() {
    try {
      const saved = JSON.parse(await readFile(profileFile, 'utf8'));
      return { preferences: typeof saved.preferences === 'string' ? saved.preferences.slice(0, 1000) : '', history: Array.isArray(saved.history) ? saved.history.filter(item => item && typeof item.title === 'string' && typeof item.at === 'string' && ['launch-request', 'viewer-review'].includes(item.type)).slice(-50) : [] };
    } catch (error) { if (error.code === 'ENOENT') return { preferences: '', history: [] }; throw error; }
  }
  async function persist(value) {
    await mkdir(path.dirname(profileFile), { recursive: true, mode: 0o700 });
    const temporary = `${profileFile}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, profileFile);
  }
  async function adb(args) {
    const result = await run('adb', ['-s', serial, ...args], { timeout: 2000, maxBuffer: 128000 });
    if (/Error:|Exception|unable to resolve|No activities found|monkey aborted/i.test(`${result.stdout || ''}\n${result.stderr || ''}`)) throw new Error('Device rejected command');
    return result.stdout || '';
  }
  async function execute(input) {
    if (!enabled || expires <= now()) return { ok: false, summary: 'TV control is disabled or its permission window has expired.' };
    if (busy) return { ok: false, summary: 'Another TV operation is in progress. Try again in a moment.' };
    busy = true;
    try {
      if (!input || typeof input.action !== 'string' || Object.keys(input).some(key => !['action', 'id', 'text'].includes(key))) throw new Error('Invalid command');
      if (input.action === 'profile') return { ok: true, profile: await profile(), catalog: await catalog(), expiresAt: new Date(expires).toISOString() };
      if (input.action === 'forget') { await persist({ preferences: '', history: [] }); return { ok: true, summary: 'Saved viewing preferences and session history deleted.' }; }
      if (['preferences', 'review'].includes(input.action)) {
        if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1000) throw new Error('Invalid profile text');
        const saved = await profile();
        if (input.action === 'preferences') saved.preferences = input.text.trim();
        else saved.history.push({ type: 'viewer-review', title: input.text.trim(), at: new Date(now()).toISOString() });
        saved.history = saved.history.slice(-50);
        await persist(saved);
        return { ok: true, summary: input.action === 'preferences' ? 'Viewing preferences saved with your permission.' : 'Your viewing reaction was saved. This does not confirm playback progress.' };
      }
      if (!['status', 'prime', 'prime-search', 'title', 'return', ...Object.keys(keys)].includes(input.action)) throw new Error('Unsupported TV action');
      if (['prime', 'prime-search', 'title'].includes(input.action) && !/^[a-zA-Z]\w*(?:\.\w+)+$/.test(primePackage)) throw new Error('Configure the verified Prime package first');
      const deviceState = await adb(['get-state']);
      if (deviceState.trim() !== 'device') throw new Error('TV not connected');
      if (input.action === 'status') return { ok: true, summary: 'An authorized ADB device is connected. Prime playback capability still requires a real-device test.' };
      if (input.action === 'prime-search') {
        const film = filmById(input.text);
        if (!film || film.kind !== 'search') throw new Error('Search title is not in the supplied catalog');
        await adb(['shell','am','start','-W','-a','android.intent.action.VIEW','-d',primeSearch(film.title),'-p',primePackage]);
        return {ok:true,summary:`The device accepted a Prime Video search request for ${film.title}. Account access, title resolution, and playback are not verified.`};
      }
      if (input.action === 'title') {
        const selected = (await catalog()).find(entry => entry.id === input.id);
        if (!selected) throw new Error('Title is not in the approved catalog');
        await adb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `https://www.amazon.com/gp/video/detail/${selected.id}`, '-p', primePackage]);
        const saved = await profile();
        saved.history.push({ type: 'launch-request', title: selected.title, at: new Date(now()).toISOString() });
        try { await persist({ ...saved, history: saved.history.slice(-50) }); }
        catch { return { ok: true, summary: `The device accepted the title-link request for ${selected.title}, but history could not be saved. Playback, subscription access, and position are not verified.` }; }
        return { ok: true, summary: `The device accepted the title-link request for ${selected.title}. Playback, subscription access, and position are not verified.` };
      }
      if (input.action === 'prime') await adb(['shell', 'monkey', '-p', primePackage, '-c', 'android.intent.category.LAUNCHER', '1']);
      else if (input.action === 'return') await adb(['shell', 'am', 'start', '-W', '-n', 'com.hearth.tv/.MainActivity']);
      else await adb(['shell', 'input', 'keyevent', keys[input.action]]);
      return { ok: true, summary: input.action === 'prime' ? 'Prime Video launch request accepted by the device; screen contents and playback are not verified.' : input.action === 'return' ? 'Return-to-Hearth request accepted. This does not force-stop Prime Video or prove playback stopped.' : `The device accepted the ${input.action} key. The target app may ignore it; playback state is not verified.` };
    } catch { return { ok: false, summary: 'TV operation failed. Check the authorized device, app installation, catalog, and storage. No success or playback state is assumed.' }; }
    finally { busy = false; }
  }
  return { authorized, execute };
}
