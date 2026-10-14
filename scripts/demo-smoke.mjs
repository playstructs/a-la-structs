// Headless check of the demo kitchen: economy, hiring, and a full service challenge both ways.
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { DemoService } = await import('../src/services/DemoService.js');
const svc = new DemoService({ tickMs: 999999, difficulty: 'difficult', rivalsMayChallenge: false });
let toasts = 0, fx = {};
svc.addEventListener('toast', (e) => { toasts++; if (process.env.V) console.log('  toast:', e.detail.text); });
svc.addEventListener('fx', (e) => { fx[e.detail.kind] = (fx[e.detail.kind] || 0) + 1; });
await svc.start(); clearInterval(svc.timer);
const s = svc.state;
console.log('structs', s.structs.size, 'takings', s.wallet.takings, 'payroll', s.wallet.payroll, 'hustle', svc.hustle());
for (let i = 0; i < 30; i++) svc.step();
console.log('after 30 ticks: recipes', s.wallet.recipes, 'gold', s.wallet.gold, 'undiscovered', s.restaurant.undiscovered);
const barista = s.types.named('Starfighter');
console.log('blocker', svc.hireBlocker(barista, 'space'));
const id = await svc.hire(barista.id, 'space');
for (let i = 0; i < 6; i++) svc.step();
console.log('hired built?', (s.structs.get(id).status & 2) > 0);
// Challenge as challenger
const rivals = await svc.findRivals();
console.log('rivals', rivals.length, rivals[0].restaurantName);
for (let i = 0; i < 10; i++) svc.step();
await svc.startChallenge(rivals[0].id);
const ch = s.challenge;
console.log('challenge structs', ch.structs.size, 'heist needed', ch.heist.needed);
// my naive player: every tick attack first reachable target with any weapon
let ticks = 0;
while (s.challenge && s.challenge.status === 'ongoing' && ticks < 200) {
  for (const a of [...ch.structs.values()].filter((x) => x.owner === s.me.id && !(x.status & 32))) {
    const targets = [...ch.structs.values()].filter((x) => x.owner !== s.me.id && !(x.status & 32));
    let done = false;
    for (const t of targets) for (const ws of ['primaryWeapon', 'secondaryWeapon']) {
      if (!done && !svc.serveBlocker(a.id, t.id, ws)) { await svc.serve(a.id, t.id, ws); done = true; }
    }
    if (done) break;
  }
  svc.step(); ticks++;
}
console.log('challenge 1 ->', ch.status, ch.result?.text, 'ticks', ticks, 'log', ch.log.length);
console.log(ch.log.slice(0, 6).map((l) => l.text).join('\n'));
svc.dismissChallenge();
svc.incomingChallenge();
const ch2 = s.challenge;
ticks = 0;
while (ch2.status === 'ongoing' && ticks < 300) { svc.step(); ticks++; }
console.log('challenge 2 (defender, idle) ->', ch2.status, ch2.result?.text, 'ticks', ticks);
console.log('fx', fx, 'toasts', toasts, 'my structs now', s.structs.size);
