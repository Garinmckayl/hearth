export const STORAGE_KEY = 'hearth.home.v1';

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function freshState() {
  return { version: 1, name: '', day: 1, sound: false, remember: true, largeText: false, gentleInvitations: true, connectedDialogue: false, voice: 'tiffany', atmosphere: 'auto', vibe: 'cozy', window: 'closed', garden: null, storyPath: [], memories: [], lastVisit: localDate() };
}

export function loadState(storage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== 1) return freshState();
    const state = freshState();
    state.name = typeof saved.name === 'string' ? saved.name.slice(0, 40) : '';
    state.day = Number.isInteger(saved.day) && saved.day > 0 ? saved.day : 1;
    for (const key of ['sound', 'remember', 'largeText', 'connectedDialogue', 'gentleInvitations']) {
      if (typeof saved[key] === 'boolean') state[key] = saved[key];
    }
    state.voice = ['tiffany', 'amy', 'olivia'].includes(saved.voice) ? saved.voice : 'tiffany';
    state.atmosphere = ['auto', 'day', 'evening', 'rain'].includes(saved.atmosphere) ? saved.atmosphere : 'auto';
    state.vibe = ['cozy', 'cold'].includes(saved.vibe) ? saved.vibe : 'cozy';
    state.window = ['open', 'closed'].includes(saved.window) ? saved.window : 'closed';
    state.garden = ['sunflowers', 'moonflowers'].includes(saved.garden) ? saved.garden : null;
    state.storyPath = Array.isArray(saved.storyPath) ? saved.storyPath.filter(choice => ['owl', 'stream', 'lantern', 'seed'].includes(choice)).slice(0, 2) : [];
    state.memories = Array.isArray(saved.memories) ? saved.memories.filter(memory => memory && typeof memory.id === 'string' && typeof memory.text === 'string' && Number.isInteger(memory.day) && memory.day > 0).slice(-50).map(memory => ({ id: memory.id.slice(0, 100), text: memory.text.slice(0, 500), day: memory.day })) : [];
    if (typeof saved.lastVisit === 'string' && saved.lastVisit < state.lastVisit) state.day += 1;
    return state;
  } catch { return freshState(); }
}

export function remember(state, id, text) {
  if (!state.remember || state.memories.some(memory => memory.id === id)) return false;
  state.memories.push({ id, text, day: state.day });
  state.memories = state.memories.slice(-50);
  return true;
}

export function forget(state, id) {
  const ids = id === 'recital' ? ['recital', 'recital-drawing', 'connection'] : [id];
  state.memories = state.memories.filter(memory => !ids.includes(memory.id));
}

export function hasMemory(state, id) {
  return state.remember && state.memories.some(memory => memory.id === id);
}

export function replyFor(text) {
  const input = text.toLowerCase();
  if (/emergency|chest pain|hurt myself|suicid|kill myself/.test(input)) return 'urgent';
  if (/quiet|lonely|alone|miss/.test(input)) return 'quiet';
  if (/recital|granddaughter|grandchild/.test(input)) return 'recital';
  if (/game|play|together/.test(input)) return 'game';
  if (/thank/.test(input)) return 'thanks';
  if (/bye|goodnight|goodbye/.test(input)) return 'goodbye';
  return 'hello';
}
