import { hasMemory } from './state.js';

export function invitationFor(state) {
  if (!state.gentleInvitations) return null;
  if (hasMemory(state, 'connection')) return { text: 'I was thinking of your granddaughter. Would you like to tell me how your time together went?', label: 'Tell Pip', action: 'followup' };
  const recital = state.remember && state.memories.find(memory => memory.id === 'recital');
  if (recital && recital.day < state.day && !hasMemory(state, 'recital-drawing')) return { text: 'I remember you mentioned a recital. Would you like to tell me how it went?', label: 'Tell Pip', action: 'followup' };
  if (hasMemory(state, 'fireside-game')) return { text: 'I enjoyed our little game. Shall we try another, or just enjoy the fire?', label: 'A little game', action: 'game' };
  if (state.garden) return { text: `There’s a lovely patch of ${state.garden} by our window. Shall we spend a moment in the garden?`, label: 'Visit our garden', action: 'garden' };
  return { text: 'I found two little packets of seeds. Would you like to choose something for our window?', label: 'Choose a flower', action: 'garden' };
}
