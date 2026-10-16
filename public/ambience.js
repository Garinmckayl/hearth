export const AMBIENCE_ACTIONS = ['cozy', 'cold', 'open-window', 'close-window'];

export function applyAmbience(state, action) {
  if (!AMBIENCE_ACTIONS.includes(action)) return false;
  if (action === 'cozy') { state.vibe = 'cozy'; state.atmosphere = 'evening'; state.window = 'closed'; }
  if (action === 'cold') { state.vibe = 'cold'; state.atmosphere = 'day'; state.window = 'open'; }
  if (action === 'open-window') state.window = 'open';
  if (action === 'close-window') state.window = 'closed';
  return true;
}
