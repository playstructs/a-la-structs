/**
 * The side sheets: staff card, hiring catalogue, roster, rivals, settings,
 * notebook. Each builder takes the app and returns the sheet's body nodes.
 */
import { h, icon, esc, fmtTicks } from './dom.js';
import { portrait, propPortrait } from '../three/portraits.js';
import { ROLES, roleOf, catalogSection, CATALOG_SECTIONS } from '../lexicon/roles.js';
import { AREAS, AREA_ORDER, areaList } from '../lexicon/areas.js';
import { TERMS, STATUS_WORDS, ACTIONS, DEFENSES, COUNTERS, CONTROL, BRAND } from '../lexicon/terms.js';
import { nameFor, speciesFor, SPECIES, SPECIES_NAMES } from '../lexicon/names.js';
import { OUTFITS } from '../three/outfits.js';
import { PROP_IS_STRUCT } from '../three/props.js';
import { is, isCommand, weaponsOf, possibleAreas, cash, gold, weaponReach } from '../game/model.js';

export function face(app, struct, type, opts = {}) {
  const role = roleOf(type);
  const r = app.engine.renderer;
  if (role.kind === 'equipment' || PROP_IS_STRUCT.has(role.station)) return propPortrait(r, role.station);
  const species = opts.species || (isCommand(type) && struct.owner === app.svc.state.me.id ? app.svc.state.me.species : speciesFor(struct.id));
  const outfit = opts.customer ? (role.customer?.outfit || 'casual') : (role.outfit || 'casual');
  const seed = isCommand(type) ? struct.owner : struct.id;
  return portrait(r, { species, outfit, seed });
}

export function ownerFace(app, id, species) {
  return portrait(app.engine.renderer, { species: species || speciesFor(id, 'owner'), outfit: { ...OUTFITS.casual, apron: '#fff7e8', apronStyle: 'waist' }, seed: id, key: `owner|${id}|${species}` });
}

function areaChip(a) { return a ? h('span', { class: `tagchip area-${a}` }, AREAS[a].name) : null; }
function hearts(n, max) {
  const out = h('span', { class: 'hearts', 'aria-label': `${n} of ${max}` });
  for (let i = 0; i < max; i++) out.appendChild(icon('heart', i < n ? '' : 'off'));
  return out;
}

function statusChips(struct, kind, extra = {}) {
  const w = STATUS_WORDS[kind] || STATUS_WORDS.staff;
  const chips = [];
  if (!is.built(struct)) chips.push(h('span', { class: 'tagchip' }, w.building));
  else if (!is.online(struct)) chips.push(h('span', { class: 'tagchip bad' }, w.offline));
  else chips.push(h('span', { class: 'tagchip good' }, w.online));
  if (is.hidden(struct)) chips.push(h('span', { class: 'tagchip' }, w.hidden));
  if (struct.protects) chips.push(h('span', { class: 'tagchip' }, icon('shield'), `Covering ${extra.protectsName || 'a teammate'}`));
  return chips;
}

/* ── Staff / equipment card ──────────────────────────────────────────────── */

export function staffSheet(app, id) {
  const svc = app.svc, st = svc.state;
  const ch = st.challenge;
  const s = (app.view === 'challenge' && ch?.structs.get(id)) || st.structs.get(id) || app.peekStructs?.get(id);
  if (!s) return { title: 'Gone', body: [h('p', {}, 'They’re not here anymore.')] };
  const t = st.types.get(s.typeId);
  const role = roleOf(t);
  const mine = s.owner === st.me.id;
  const inChallenge = app.view === 'challenge' && ch && ch.structs.has(id);
  const isCustomer = inChallenge && s.owner === ch.guestId;
  const kind = role.kind;
  const name = kind === 'equipment' ? role.role : nameFor(s.id);
  const title = isCustomer ? (isCommand(t) ? 'Food Critic' : role.customer?.persona || 'Customer') : (kind === 'equipment' ? role.role : `${name} the ${role.role}`);
  const allStructs = new Map([...(ch?.structs || []), ...st.structs]);
  const protectsName = s.protects ? (allStructs.get(s.protects) ? nameFor(s.protects) : 'a teammate') : null;
  const job = st.jobs.get(s.id);

  const body = [];
  body.push(h('div', { class: 'hero' },
    h('img', { src: face(app, s, t, { customer: isCustomer, species: isCommand(t) && ch && s.owner !== st.me.id ? (s.owner === ch.hostId ? ch.host.species : ch.guest.species) : undefined }), alt: '' }),
    h('div', {},
      h('h3', {}, isCustomer ? `${title}` : title),
      h('div', { class: 'sub' }, isCustomer ? `${nameFor(s.id)}, ${AREAS[s.ambit]?.customerSpot}` : `${role.role} · ${AREAS[s.ambit]?.name || ''}`),
      h('div', {}, isCustomer
        ? h('span', { class: 'tagchip' }, `Needs met: ${s.maxHealth - s.health} / ${s.maxHealth}`)
        : hearts(s.health, s.maxHealth)),
    )));
  body.push(h('div', { class: 'meta', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, ...statusChips(s, kind, { protectsName }), areaChip(s.ambit)));
  const myCustomer = isCustomer && mine;
  body.push(h('div', { class: 'blurb' }, myCustomer
    ? (isCommand(t) ? 'Your Manager, posing as a Food Critic. If their staff fully satisfy them, your whole crew goes home. Keep them grumpy!' : `Your ${role.role}, posing as a ${role.customer?.persona || 'customer'}. Complain to their staff — if they get fully satisfied they’ll leave.`)
    : isCustomer ? (isCommand(t) ? ROLES['Command Ship'].customer.blurb : `A ${role.customer?.persona || 'customer'} from ${ch.guest.name}’s crew. Serve them until they’re fully satisfied and they’ll leave.`) : role.blurb));

  if (!is.built(s)) {
    const p = s.build?.progress ?? job?.progress ?? 0;
    body.push(h('div', {}, h('div', { class: 'section-title' }, kind === 'equipment' ? 'Delivery' : 'Onboarding'), h('div', { class: 'progress butter', style: { marginTop: '8px' } }, h('i', { style: { width: `${Math.round(p * 100)}%` } }))));
  }
  if (mine && t.planetaryMining && t.planetaryMining !== 'noPlanetaryMining' && st.restaurant.undiscovered <= 0 && !app.readOnly) {
    body.push(h('div', { class: 'note warn' }, 'Every recipe in this restaurant has been discovered. Open a new restaurant to keep experimenting — your crew comes along, but kitchen staff and equipment stay behind.',
      h('div', {}, h('button', { class: 'btn small butter', style: { marginTop: '8px' }, onclick: () => app.confirm('Open a new restaurant?', 'Your crew moves with you. Kitchen staff and equipment stay at the old place.', 'Open it', () => app.act(() => svc.openNewRestaurant())) }, icon('store'), 'Open a new restaurant'))));
  }
  if (job && is.built(s) && (job.kind === 'mine' || job.kind === 'refine')) {
    body.push(h('div', {}, h('div', { class: 'section-title' }, job.label || role.job?.name || 'Working'), h('div', { class: 'progress', style: { marginTop: '8px' } }, h('i', { style: { width: `${Math.round((job.progress || 0) * 100)}%` } }))));
  }

  // skills
  const weapons = weaponsOf(t);
  if (weapons.length) {
    body.push(h('div', { class: 'section-title' }, isCustomer ? 'Complaints they can make' : 'How they serve'));
    for (const w of weapons) {
      const act = (isCustomer || (inChallenge && mine && ch.role === 'challenger') ? role.complain : role.serve)?.[w.ws] || {};
      const reach = weaponReach(t, w.ws, s.ambit).map((a) => AREAS[a].short).join(', ');
      const row = h('div', { class: 'skill' },
        icon(isCustomer || (inChallenge && mine && ch.role === 'challenger') ? 'grumble' : 'plate'),
        h('div', {}, h('b', {}, act.name || 'Serve'), h('small', {}, `Reaches: ${reach} · ${CONTROL[w.control] || ''}${w.shots > 1 ? ` · ${w.shots} at once` : ''}${w.piercing ? ' · cuts through thick skin' : ''}`)),
        h('span', { class: 'tagchip', title: `${w.charge} ${TERMS.charge}` }, icon('hustle'), String(w.charge)),
      );
      if (inChallenge && mine && is.online(s) && ch.status === 'ongoing') {
        const verb = ch.role === 'challenger' ? ACTIONS.attackAsGuest : ACTIONS.attackAsHost;
        row.appendChild(h('div', { style: { gridColumn: '1 / -1' } }, h('button', { class: `btn small ${ch.role === 'challenger' ? 'berry' : ''} wide`, onclick: () => app.beginServe(s.id, w.ws) }, `${verb}: pick a ${ch.role === 'challenger' ? 'staff member' : 'customer'}`)));
      }
      body.push(row);
    }
  }
  const def = DEFENSES[t.unitDefenses];
  const cnt = COUNTERS[t.passiveWeaponry];
  if (kind === 'staff' && t.category === 'fleet') {
    body.push(h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('small', {}, 'Special trick'), h('b', {}, def?.name || '—'), def?.blurb ? h('div', { style: { fontSize: '.8rem', color: 'var(--muted)' } }, def.blurb) : null),
      h('div', { class: 'fact' }, h('small', {}, 'When complained at'), h('b', {}, cnt?.name || '—'), cnt?.blurb ? h('div', { style: { fontSize: '.8rem', color: 'var(--muted)' } }, cnt.blurb) : null),
    ));
  }
  if (!isCustomer) {
    body.push(h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('small', {}, kind === 'equipment' ? 'Running cost' : 'Wage'), h('b', {}, `${cash(t.passiveDraw)} / tick`)),
      t.generatingRate ? h('div', { class: 'fact' }, h('small', {}, 'Brings in'), h('b', {}, s.fuel ? `${gold(s.fuel)} gold invested` : 'Needs gold invested')) :
        h('div', { class: 'fact' }, h('small', {}, 'Works in'), h('b', {}, areaList(t.possibleAmbit, { includeLocal: false }))),
    ));
  }

  // actions for my own staff
  const foot = [];
  if (mine && !app.readOnly) {
    const words = ACTIONS;
    if (!is.built(s)) foot.push(h('button', { class: 'btn ghost small', onclick: () => app.act(() => svc.cancelHire(s.id)) }, kind === 'equipment' ? words.cancelBuild.equipment : words.cancelBuild.staff));
    else {
      if (is.online(s)) foot.push(h('button', { class: 'btn ghost small', onclick: () => app.act(() => svc.clockOut(s.id)) }, kind === 'equipment' ? words.deactivate.equipment : words.deactivate.staff));
      else foot.push(h('button', { class: 'btn small', onclick: () => app.act(() => svc.clockIn(s.id)) }, kind === 'equipment' ? words.activate.equipment : words.activate.staff, h('span', { class: 'tagchip' }, icon('hustle'), String(t.activateCharge || 0))));
      if (t.canDefend && is.online(s)) {
        if (s.protects) foot.push(h('button', { class: 'btn ghost small', onclick: () => app.act(() => svc.uncover(s.id)) }, words.defenseClear));
        else foot.push(h('button', { class: 'btn sea small', onclick: () => app.beginCover(s.id) }, icon('shield'), words.defenseSet));
      }
      if (t.unitDefenses === 'stealthMode' && is.online(s)) foot.push(h('button', { class: 'btn butter small', onclick: () => app.act(() => svc.blendIn(s.id, !is.hidden(s))) }, is.hidden(s) ? words.stealthOff : words.stealthOn, h('span', { class: 'tagchip' }, icon('hustle'), String(t.stealthActivateCharge || 0))));
      if (isCommand(t) && is.online(s)) {
        body.push(h('div', { class: 'section-title' }, `${ROLES['Command Ship'].drive.name} (${t.moveCharge} hustle)`));
        body.push(h('div', { class: 'tabs' }, ...possibleAreas(t).map((a) => h('button', { class: `chip-btn ${s.ambit === a ? 'on' : ''}`, disabled: s.ambit === a, onclick: () => app.act(() => svc.walkManager(a)) }, AREAS[a].name))));
      }
      if (t.generatingRate) {
        const inp = h('input', { type: 'number', min: '1', value: '5', id: `invest-${s.id}`, style: { width: '90px' }, 'aria-label': 'Gold to invest' });
        body.push(h('div', { class: 'field' }, h('label', { for: `invest-${s.id}` }, `${TERMS.infuse} (you have ${gold(st.wallet.gold)})`),
          h('div', { style: { display: 'flex', gap: '8px' } }, inp, h('button', { class: 'btn butter small', onclick: () => app.act(() => svc.investGold(s.id, inp.value)) }, icon('gold'), 'Invest'))));
      }
    }
  }
  return { title, body, foot };
}

/* ── Hire & Buy ─────────────────────────────────────────────────────────── */

export function hireSheet(app, section = 'space') {
  const svc = app.svc, st = svc.state;
  const types = st.types.all().filter((t) => t.type !== 'Command Ship');
  const tabs = h('div', { class: 'tabs' }, ...CATALOG_SECTIONS.map((sec) => h('button', { class: `chip-btn ${sec.key === section ? 'on' : ''}`, onclick: () => app.openSheet('hire', sec.key) }, sec.title)));
  const sec = CATALOG_SECTIONS.find((x) => x.key === section);
  const list = types.filter((t) => catalogSection(t) === section);
  const body = [tabs, h('p', {}, `${sec.note}. Hiring costs hustle and needs spare cash for their wage. You have ${svc.hustle()} hustle and ${cash(svc.spareCash())} spare.`)];
  if (!svc.manager()) body.push(h('div', { class: 'note warn' }, 'You need a Manager before anyone else can be hired.'));
  for (const t of list) {
    const role = roleOf(t);
    const areas = possibleAreas(t);
    const choice = app.hireArea?.[t.id] && areas.includes(app.hireArea[t.id]) ? app.hireArea[t.id] : areas[0];
    const blocker = svc.hireBlocker(t, choice);
    const img = role.kind === 'equipment' || PROP_IS_STRUCT.has(role.station)
      ? propPortrait(app.engine.renderer, role.station)
      : portrait(app.engine.renderer, { species: SPECIES[(t.id * 7) % SPECIES.length], outfit: role.outfit, seed: 'cat' + t.id });
    const weapons = weaponsOf(t);
    const skillNames = weapons.map((w) => role.serve?.[w.ws]?.name).filter(Boolean);
    const card = h('div', { class: 'card' },
      h('img', { class: 'portrait', src: img, alt: '' }),
      h('div', {},
        h('h3', {}, role.role),
        h('div', { class: 'sub' }, skillNames.length ? skillNames.join(' · ') : role.job?.name || (t.generatingRate ? 'Brings in cash' : 'Restaurant gear')),
        h('p', {}, role.blurb)),
      h('div', { class: 'meta' },
        h('span', { class: 'tagchip', title: TERMS.charge }, icon('hustle'), `${t.buildCharge} hustle`),
        h('span', { class: 'tagchip', title: 'Wage per tick' }, icon('cash'), `${cash(t.passiveDraw)}/tick`),
        h('span', { class: 'tagchip', title: 'Onboarding time' }, icon('clock'), app.svc.mode === 'demo' ? fmtTicks(Math.max(2, Math.round(t.buildDifficulty / 90)), st.tickMs) : `difficulty ${t.buildDifficulty}`),
        t.buildLimit ? h('span', { class: 'tagchip' }, `max ${t.buildLimit}`) : null,
      ),
      areas.length > 1 ? h('div', { class: 'actions' }, h('small', { style: { fontWeight: 800, color: 'var(--muted)' } }, 'Where:'),
        ...areas.map((a) => h('button', { class: `chip-btn ${a === choice ? 'on' : ''}`, onclick: () => { app.hireArea = { ...(app.hireArea || {}), [t.id]: a }; app.openSheet('hire', section); } }, AREAS[a].short))) : null,
      h('div', { class: 'actions' },
        h('button', { class: `btn small ${role.kind === 'equipment' ? 'sea' : ''}`, disabled: !!blocker, onclick: () => app.hire(t.id, choice) }, role.kind === 'equipment' ? `Buy` : `Hire`, ' ', h('span', {}, role.kind === 'equipment' ? '' : `· ${AREAS[choice].short}`)),
        blocker ? h('span', { class: 'why' }, blocker) : null),
    );
    body.push(card);
  }
  return { title: 'Hire & Buy', body };
}

/* ── Roster ─────────────────────────────────────────────────────────────── */

export function rosterSheet(app) {
  const st = app.svc.state;
  const body = [];
  const list = [...st.structs.values()].filter((s) => !is.destroyed(s));
  body.push(h('p', {}, `${list.length} on the books · wages ${cash(st.wallet.payroll)} of ${cash(st.wallet.takings)} takings per tick.`));
  const groups = [...AREA_ORDER.map((a) => ({ key: a, title: AREAS[a].name, items: list.filter((s) => s.ambit === a && roleOf(st.types.get(s.typeId)).display === 'station') })),
    { key: 'curb', title: 'Out front & roaming', items: list.filter((s) => roleOf(st.types.get(s.typeId)).display !== 'station') }];
  for (const g of groups) {
    if (!g.items.length) continue;
    body.push(h('div', { class: 'section-title' }, g.title));
    for (const s of g.items) {
      const t = st.types.get(s.typeId), role = roleOf(t);
      body.push(h('button', { class: 'card card-btn', onclick: () => app.selectStruct(s.id) },
        h('img', { class: 'portrait', src: face(app, s, t), alt: '' }),
        h('div', {},
          h('h3', {}, role.kind === 'equipment' ? role.role : nameFor(s.id)),
          h('div', { class: 'sub' }, role.kind === 'equipment' ? (s.locationType === 'planet' ? 'Equipment' : '') : role.role),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } }, ...statusChips(s, role.kind), s.health < s.maxHealth ? h('span', { class: 'tagchip bad' }, `${s.health}/${s.maxHealth} morale`) : null)),
      ));
    }
  }
  if (st.crew.status === 'away') body.unshift(h('div', { class: 'note warn' }, 'Your crew is out on a service challenge. Only your kitchen team and equipment are at the restaurant.'));
  return { title: 'Your Staff', body };
}

/* ── Rivals ─────────────────────────────────────────────────────────────── */

export function rivalsSheet(app, list, query = '') {
  const svc = app.svc, st = svc.state;
  const search = h('input', { type: 'search', id: 'rival-search', placeholder: 'Search owners, restaurants, groups', value: query, 'aria-label': 'Search rivals' });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') app.openSheet('rivals', search.value); });
  const body = [
    h('p', {}, `Send your crew to a rival restaurant as customers. Complain until you can copy their recipes — but if they fully satisfy your Food Critic, the party goes home empty-handed.`),
    h('div', { class: 'field' }, h('label', { for: 'rival-search' }, 'Find a rival'), h('div', { style: { display: 'flex', gap: '8px' } }, search, h('button', { class: 'btn small sea', onclick: () => app.openSheet('rivals', search.value) }, 'Search'))),
  ];
  const blocker = st.challenge && st.challenge.status === 'ongoing' ? 'You’re already in a service challenge.' : st.crew.status !== 'home' ? 'Your crew is out.' : !svc.manager() ? 'You need a Manager to lead the crew.' : null;
  if (blocker) body.push(h('div', { class: 'note warn' }, blocker));
  if (svc.mode === 'demo' && !blocker) {
    body.push(h('div', { class: 'note' }, h('b', {}, 'Practice defending: '), 'invite a rival crew to dine at your place right now.', ' ',
      h('button', { class: 'btn small butter', style: { marginTop: '8px' }, onclick: () => { app.closeSheet(); svc.incomingChallenge(); } }, icon('door'), 'Invite them over')));
  }
  if (!list) body.push(h('p', {}, 'Looking around town…'));
  else if (!list.length) body.push(h('p', {}, 'Nobody matches that.'));
  else for (const r of list) {
    body.push(h('div', { class: 'card' },
      h('img', { class: 'portrait', src: ownerFace(app, r.id, r.species), alt: '' }),
      h('div', {},
        h('h3', {}, r.restaurantName),
        h('div', { class: 'sub' }, `${r.name}${r.guildName ? ` · ${r.guildName}` : ''}`),
      ),
      h('div', { class: 'meta' },
        h('span', { class: 'tagchip', title: TERMS.ore }, icon('recipe'), `${r.recipes} recipes`),
        r.reputation != null ? h('span', { class: 'tagchip' }, icon('sparkle'), `${r.reputation} rep`) : null,
        r.staff != null ? h('span', { class: 'tagchip' }, icon('staff'), `${r.staff} staff`) : null,
        h('span', { class: `tagchip ${r.crewHome ? 'bad' : 'good'}` }, r.crewHome ? 'Crew at home' : 'Crew out'),
        r.underChallenge ? h('span', { class: 'tagchip bad' }, 'Already busy') : null),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small berry', disabled: !!blocker || r.underChallenge, onclick: () => app.challenge(r) }, icon('bell'), 'Send the crew'),
        h('button', { class: 'btn small ghost', onclick: () => app.peek(r.id, true) }, 'Size them up')),
    ));
  }
  return { title: 'Rival Restaurants', body };
}

/* ── Settings ───────────────────────────────────────────────────────────── */

export function settingsSheet(app) {
  const svc = app.svc, st = svc.state;
  const body = [];
  const nameIn = h('input', { id: 'set-name', value: st.me.name, maxlength: '24' });
  body.push(h('div', { class: 'section-title' }, 'You'));
  const grid = h('div', { class: 'species-grid' });
  for (const sp of SPECIES) {
    grid.appendChild(h('button', { class: sp === st.me.species ? 'on' : '', title: SPECIES_NAMES[sp], 'aria-label': SPECIES_NAMES[sp], onclick: () => app.setProfile({ species: sp }) },
      h('img', { src: ownerFace(app, st.me.id || 'me', sp), alt: '' })));
  }
  body.push(grid);
  body.push(h('div', { class: 'field' }, h('label', { for: 'set-name' }, 'Owner name (shown in town)'), h('div', { style: { display: 'flex', gap: '8px' } }, nameIn, h('button', { class: 'btn small', onclick: () => app.setProfile({ name: nameIn.value }) }, 'Save'))));

  if (svc.mode === 'demo') {
    body.push(h('div', { class: 'section-title' }, 'Kitchen clock'));
    body.push(h('div', { class: 'tabs' }, ...[[6000, 'Relaxed (6s, like the real game)'], [3000, 'Brisk (3s)'], [1500, 'Lunch rush (1.5s)']].map(([ms, label]) => h('button', { class: `chip-btn ${st.tickMs === ms ? 'on' : ''}`, onclick: () => { svc.setSpeed(ms); app.prefs.tickMs = ms; app.savePrefs(); app.openSheet('settings'); } }, label))));
    body.push(h('div', { class: 'section-title' }, 'Rival restaurants play…'));
    body.push(h('div', { class: 'tabs' }, ...[['easy', 'Gently'], ['difficult', 'Seriously'], ['hard', 'Ruthlessly']].map(([k, label]) => h('button', { class: `chip-btn ${svc.difficulty === k ? 'on' : ''}`, onclick: () => { svc.difficulty = k; app.prefs.difficulty = k; app.savePrefs(); app.openSheet('settings'); } }, label))));
    body.push(h('label', { class: 'chip-btn', style: { justifySelf: 'start' } }, h('input', { type: 'checkbox', checked: svc.rivalsMayChallenge, onchange: (e) => { svc.rivalsMayChallenge = e.target.checked; app.prefs.rivalsMayChallenge = e.target.checked; app.savePrefs(); } }), 'Rivals may challenge me'));
  }
  body.push(h('div', { class: 'section-title' }, 'Graphics & sound'));
  body.push(h('div', { class: 'tabs' }, ...[['high', 'Fancy'], ['medium', 'Balanced'], ['low', 'Speedy']].map(([q, label]) => h('button', { class: `chip-btn ${app.engine.quality === q ? 'on' : ''}`, onclick: () => { app.engine.setQuality(q); app.prefs.quality = q; app.savePrefs(); app.openSheet('settings'); } }, label)),
    h('button', { class: `chip-btn ${app.prefs.sound !== false ? 'on' : ''}`, onclick: () => app.toggleSound() }, icon('sound'), app.prefs.sound !== false ? 'Sound on' : 'Sound off')));

  body.push(h('div', { class: 'section-title' }, 'Kitchen glossary'));
  body.push(h('p', {}, 'À la Structs runs on Structs. Your rivals may be playing the original game — here is what everything is called on their side.'));
  const rows = [
    ['Owner', 'Player'], ['Restaurant Group', 'Guild'], ['Restaurant', 'Planet'], ['Crew', 'Fleet'], ['Manager', 'Command Ship'],
    ['Staff & Equipment', 'Structs'], ['Bar & Counter', 'Space ambit'], ['Dining Room', 'Air ambit'], ['Cooking Line', 'Land ambit'], ['Dish Pit', 'Water ambit'],
    ['Recipes', 'Ore'], ['Undiscovered Recipes', 'Undiscovered Ore'], ['Gold', 'Alpha Matter'], ['Cash (takings / wages)', 'Energy (capacity / load)'],
    ['Hustle', 'Charge'], ['Tick', 'Block'], ['Service Challenge', 'Raid'], ['Serve / Complain', 'Attack'], ['Cover for', 'Defend'], ['Blend in', 'Stealth'],
    ['Clock in / out', 'Activate / Deactivate'], ['Hire / Buy', 'Build'], ['Morale / Needs', 'Health'], ['Fired', 'Destroyed'], ['Reputation (soft-serve)', 'Planetary shield'],
    ...Object.entries(ROLES).map(([k, v]) => [v.role, k]),
  ];
  body.push(h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'gloss' }, h('tbody', {}, ...rows.map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))))));

  const foot = [];
  if (svc.mode === 'demo') foot.push(h('button', { class: 'btn ghost small', onclick: () => app.confirm('Start the demo kitchen over?', 'Your demo restaurant, staff and gold reset to the opening day.', 'Start over', () => { svc.reset(); app.closeSheet(); }) }, 'Start the demo over'));
  foot.push(h('button', { class: 'btn ghost small', onclick: () => app.backToTitle() }, svc.mode === 'demo' ? 'Back to title' : 'Sign out'));
  return { title: 'Settings', body, foot };
}

/* ── Notebook (event log) ───────────────────────────────────────────────── */

export function notebookSheet(app) {
  const st = app.svc.state;
  const body = [h('p', {}, 'Everything that happened today, newest first.')];
  if (!st.log.length) body.push(h('p', {}, 'A quiet day so far.'));
  for (const l of st.log.slice(0, 60)) body.push(h('div', { class: `card`, style: { gridTemplateColumns: '1fr' } }, h('div', { class: 'sub' }, `Tick ${l.tick.toLocaleString('en-US')}`), h('div', {}, l.text)));
  return { title: 'Notebook', body };
}

export { esc, BRAND };
