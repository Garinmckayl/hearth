import { SonicSession } from '../lib/sonic.mjs';

let actions = 0;
let audioBytes = 0;
let succeeded = false;
let completed;
const finished = new Promise(resolve => { completed = resolve; });
const session = new SonicSession({
  executeAction: async action => {
    if (action.action !== 'dance') throw new Error('Expected a dance');
    actions += 1;
    console.log('Nova Sonic requested a real dance action. Returning a simulated TV acknowledgment.');
    return { ok: true, action: action.action, status: 'The test television started the dance.' };
  },
  onEvent: event => {
    if (event.audioOutput) audioBytes += Buffer.from(event.audioOutput.content, 'base64').length;
    if (actions && audioBytes > 12000 && event.contentEnd?.type === 'AUDIO') { succeeded = true; completed(); session.stop(); }
  }
});
const silence = setInterval(() => { if (session.audioStarted) session.audio(Buffer.alloc(2560)); }, 80);
const timeout = setTimeout(() => { completed(); session.stop(); }, 30000);
const running = session.run({ initialText: 'Pip, please do your little fireside dance for me now.' }).catch(error => { if (!succeeded) console.error(error.name, error.message); completed(); });
await finished;
clearTimeout(timeout); clearInterval(silence); session.stop(); await running;
if (!succeeded) { console.error('Live Sonic action check failed.'); process.exitCode = 1; }
else console.log(`Live Sonic action check passed: ${actions} dance tool call(s), tool result returned, ${audioBytes} response audio bytes.`);
