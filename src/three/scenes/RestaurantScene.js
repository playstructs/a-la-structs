/**
 * A restaurant, alive: staff at their stations doing their jobs, equipment
 * humming, diners eating, folks strolling past. Used for your own place, for
 * peeking into a group member's, and (via ChallengeScene) as the battleground
 * of a service challenge.
 */
import * as THREE from 'three';
import { buildRestaurant } from '../env.js';
import { Character } from '../Character.js';
import { OUTFITS, casualOutfit } from '../outfits.js';
import { STATION_PROPS, PROP_IS_STRUCT, onboardingBox, managerDesk } from '../props.js';
import { FX } from '../fx.js';
import { NavGrid } from '../nav.js';
import { sfx } from '../../audio/sfx.js';
import { el, pips } from '../labels.js';
import { dutyFor } from '../duties.js';
import { V, STATIONS, COMMAND_SPOT, PLANET_SPOTS, CURB_SPOTS, route, DOOR, randomIn, zoneOf } from '../layout.js';
import { roleOf } from '../../lexicon/roles.js';
import { nameFor, speciesFor, rng, SPECIES } from '../../lexicon/names.js';
import { STATUS_WORDS } from '../../lexicon/terms.js';
import { is, isCommand } from '../../game/model.js';
import { AREAS } from '../../lexicon/areas.js';

const tmpV = new THREE.Vector3();
/** Floor mats and thin stands that critters may walk over. */
const NAV_SKIP = new Set(['spinnerSpot', 'ringLight']);

export class RestaurantScene extends EventTarget {
  /**
   * @param {{ name: string, ownerId: string, mode?: 'home'|'peek'|'challenge', ambient?: boolean }} opts
   */
  constructor(opts = {}) {
    super();
    this.opts = { mode: 'home', ambient: true, ...opts };
    this.mode = this.opts.mode;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#bfe7f5');
    this.scene.fog = new THREE.Fog('#bfe7f5', 55, 110);
    this.addLights();
    this.env = buildRestaurant({ name: opts.name, ownerId: opts.ownerId });
    this.scene.add(this.env.group);
    this.ground = this.env.ground;
    this.fx = new FX(this.scene);
    this.actors = new Map();
    this.ambient = [];
    this.timers = [];
    this.time = 0;
    this.selectedId = null;
    this.hoverId = null;
    this.ctx = { types: null };
    this.r = rng('ambient-' + (opts.ownerId || 'x'));
    this.awayNotice = null;
    this.nav = null;          // walkable floor, rebuilt when gear comes or goes (navGrid)
  }

  addLights() {
    const hemi = new THREE.HemisphereLight('#fff6e5', '#b9a3d6', 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    sun.position.set(-14, 26, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -22; s.right = 22; s.top = 22; s.bottom = -22; s.near = 1; s.far = 80;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(sun.target);
    const fill = new THREE.DirectionalLight('#cfe6ff', 0.45);
    fill.position.set(18, 10, -6);
    this.scene.add(fill);
  }

  fit(engine) {
    // Fit the building's width to the screen.
    const vfov = (engine.camera.fov * Math.PI) / 180;
    const tanH = Math.tan(vfov / 2) * Math.max(0.3, engine.camera.aspect);
    const dist = Math.min(64, Math.max(24, 14.5 / tanH));
    const dir = V(0, 1, 0.92).normalize();
    const target = V(0, -0.6, 0);
    engine.frameView({
      target, position: target.clone().addScaledVector(dir, dist), minDistance: 10, maxDistance: 75,
      minPolar: 0.25, maxPolar: 1.2, minAzimuth: -0.85, maxAzimuth: 0.85,
    });
    this.fitAspect = engine.camera.aspect;
  }

  onResize(engine) {
    if (!this.fitAspect) return;
    const r = engine.camera.aspect / this.fitAspect;
    if (r > 1.3 || r < 0.77) this.fit(engine);
  }

  enter(engine) {
    this.engine = engine;
    this.fit(engine);
    // CSS2D labels were cleared by the engine: re-attach ours.
    for (const a of this.actors.values()) this.reattachLabel(a);
    if (this.opts.ambient && this.mode !== 'challenge' && !this.ambientStarted) this.startAmbient();
  }

  exit() {}

  /* ── walking around things ────────────────────────────────────────────── */

  /** The walkable floor: building and furniture, plus every station, desk and delivery box placed right now. */
  navGrid() {
    if (this.nav) return this.nav;
    const nav = new NavGrid(this.env.obstacles);
    for (const a of this.actors.values()) {
      if (a.prop && a.prop.visible !== false && !NAV_SKIP.has(a.role.station)) nav.addObject(a.prop);
      if (a.box) nav.addObject(a.box);
    }
    return (this.nav = nav);
  }

  /** Points to walk from `from` to `to` around walls and furniture. */
  route(from, to) { return this.navGrid().path(from, to) || route(from, to); }

  /** Walk off down the street (left or right) from wherever they are. */
  routeAway(from, dir, z = 9.4) { return [...this.route(from, V(16.5 * dir, z)), V(24 * dir, z)]; }

  /* ── timers that pause with the scene ─────────────────────────────────── */

  after(sec, fn) { this.timers.push({ at: this.time + sec, fn }); }

  /* ── struct sync ──────────────────────────────────────────────────────── */

  /**
   * @param {Array} structs normalized structs to show
   * @param {{ types, ownerSpecies, crewAway, jobs, hostId }} ctx
   */
  sync(structs, ctx) {
    this.ctx = ctx;
    const seen = new Set();
    for (const s of structs) {
      if (is.destroyed(s) && (this.mode !== 'challenge' || !this.actors.has(s.id))) continue;
      const t = ctx.types.get(s.typeId);
      if (!t) continue;
      if (ctx.crewAway && s.locationType === 'fleet' && this.mode === 'home') continue;
      seen.add(s.id);
      const existing = this.actors.get(s.id);
      if (existing && existing.placementKey !== this.placementKey(s, t)) {
        if (isCommand(t) && existing.character && !is.destroyed(s)) { this.moveActor(existing, s, t); continue; }
        this.removeActor(existing);
      }
      const a = this.actors.get(s.id);
      if (a) this.updateActor(a, s, t);
      else this.addActor(s, t);
    }
    for (const [id, a] of this.actors) if (!seen.has(id) && !a.leaving) this.removeActor(a);
    this.updateAwayNotice(ctx);
  }

  placementKey(s, t) {
    const role = roleOf(t);
    return `${s.locationType}:${s.ambit}:${isCommand(t) ? 'cmd' : s.slot}:${role.display}:${this.ctx?.skinKey?.(s, role) || 0}`;
  }

  placement(s, t) {
    const role = roleOf(t);
    const area = s.ambit || 'land';
    if (isCommand(t)) { const c = COMMAND_SPOT[area]; return { stand: c.stand.clone(), prop: c.stand.clone().add(V(0.95, 0.25)), face: c.face, propFace: c.face }; }
    if (role.display === 'outside') {
      const p = (CURB_SPOTS[area] || CURB_SPOTS.land)[s.slot % 4];
      return { stand: p.clone(), prop: p.clone().add(V(0, -0.1)), face: 0, outside: true };
    }
    if (role.display === 'roam') { const p = (CURB_SPOTS[area] || CURB_SPOTS.land)[s.slot % 4]; return { stand: randomIn('air', 1.5), prop: p.clone().add(V(0, -0.6)), face: 0, roam: true }; }
    if (s.locationType === 'planet') { const p = (PLANET_SPOTS[area] || PLANET_SPOTS.land)[s.slot % 4]; return { stand: p.stand.clone(), prop: p.prop.clone(), face: p.face }; }
    const st = (STATIONS[area] || STATIONS.land)[s.slot % 4];
    return { stand: st.stand.clone(), prop: st.prop.clone(), face: st.face };
  }

  addActor(s, t) {
    const role = roleOf(t);
    const place = this.placement(s, t);
    const a = {
      id: s.id, struct: s, type: t, role, area: s.ambit, home: place.stand, place, placementKey: this.placementKey(s, t),
      character: null, prop: null, box: null, token: 0, leaving: false, label: null,
      name: nameFor(s.id), species: isCommand(t) && this.ctx.ownerSpecies ? this.ctx.ownerSpecies : speciesFor(s.id),
      side: this.sideOf(s),
    };
    // workstation / equipment prop
    const propKey = role.station;
    const propFn = STATION_PROPS[propKey];
    if (isCommand(t)) {
      a.prop = managerDesk();
    } else if (propFn) {
      a.prop = propKey === 'poleSign' ? propFn(this.opts.signWord || 'EAT!') : propFn();
      if (propKey === 'poleSign') a.prop.scale.setScalar(0.72);
    }
    if (a.prop) {
      a.prop.position.copy(place.prop);
      a.prop.rotation.y = place.propFace || 0;
      a.prop.userData.pick = { structId: s.id };
      this.env.group.add(a.prop);
    }
    if (role.kind === 'staff' && !PROP_IS_STRUCT.has(propKey)) {
      const outfit = this.ctx?.outfitFor?.(s, role) || OUTFITS[role.outfit] || OUTFITS.casual;
      a.character = new Character({ species: a.species, outfit, seed: isCommand(t) ? s.owner : s.id, data: { structId: s.id } });
      a.character.setPosition(place.stand.x, 0, place.stand.z);
      a.character.object.rotation.y = place.face || 0;
      a.character.face(place.face || 0);
      this.env.group.add(a.character.object);
    }
    a.anchor = a.character ? a.character.anchor : this.propAnchor(a);
    a.label = this.makeLabel(a);
    this.actors.set(s.id, a);
    this.nav = null;
    this.updateActor(a, s, t, true);
    return a;
  }

  propAnchor(a) {
    const o = new THREE.Object3D();
    const box = new THREE.Box3().setFromObject(a.prop);
    o.position.set(0, (box.max.y - a.prop.position.y) + 0.35, 0);
    a.prop.add(o);
    return o;
  }

  moveActor(a, s, t) {
    // The Manager walks to their new area.
    const place = this.placement(s, t);
    a.place = place; a.home = place.stand; a.area = s.ambit; a.placementKey = this.placementKey(s, t);
    if (a.prop) a.prop.position.copy(place.prop);
    this.nav = null;
    a.token++;
    a.character.walkTo(this.route(a.character.position, place.stand), () => { a.character.face(place.face || 0); this.runDuty(a); });
    a.struct = s;
    this.refreshLabel(a);
  }

  sideOf(s) {
    if (this.mode !== 'challenge') return 'host';
    return s.owner === this.ctx.hostId ? 'host' : 'guest';
  }

  updateActor(a, s, t, fresh = false) {
    const prev = a.struct;
    a.struct = s;
    const building = !is.built(s);
    const online = is.online(s);
    const hidden = is.hidden(s);
    const c = a.character;

    // onboarding box
    if (building && !a.box) {
      a.box = onboardingBox(a.role.kind === 'equipment');
      a.box.position.copy(a.role.kind === 'equipment' || !c ? a.place.prop : a.place.stand);
      a.box.userData.pick = { structId: s.id };
      this.env.group.add(a.box);
      this.nav = null;
      if (a.prop) a.prop.visible = a.role.kind !== 'equipment';
      if (c) c.object.visible = false;
    } else if (!building && a.box) {
      this.env.group.remove(a.box); a.box = null;
      this.nav = null;
      if (a.prop) a.prop.visible = true;
      if (c) { c.object.visible = true; c.hop(1); }
      this.fx.emit('confetti', tmpV.copy(a.place.stand).setY(1.2), { count: 18, spread: 1.2, up: 2.4 });
      if (!fresh) this.say(a, a.role.kind === 'equipment' ? null : 'Reporting for duty!');
    }

    if (c) {
      c.setHidden(hidden);
      const wasOffline = prev && !is.online(prev);
      if (!building && !online) {
        if (!c.sleeping || fresh) { a.token++; c.stop(); c.walkTo(this.route(c.position, a.home), () => { c.face(a.place.face || 0); c.sleep(true); }); }
      } else if (!building && online && (fresh || wasOffline || c.sleeping)) {
        c.sleep(false); c.sit(false);
        if (a.side === 'host') this.runDuty(a);
      }
    }
    this.refreshLabel(a);
  }

  removeActor(a) {
    a.token++;
    if (a.character) a.character.dispose();
    if (a.prop) this.env.group.remove(a.prop);
    if (a.box) this.env.group.remove(a.box);
    if (a.label) { a.label.removeFromParent(); a.label.element.remove(); }
    this.actors.delete(a.id);
    this.nav = null;
    if (this.selectedId === a.id) this.selectedId = null;
  }

  updateAwayNotice(ctx) {
    const show = this.mode === 'home' && ctx.crewAway;
    if (show && !this.awayNotice) {
      const elx = el('div', 'away-notice', '<b>Crew is out</b><span>on a service challenge — back soon!</span>');
      const o = new THREE.Object3D();
      o.position.set(0.8, 2.2, 2.0);
      this.scene.add(o);
      this.awayNotice = this.engine?.labels.attach(o, elx) || null;
      this.awayNoticeHolder = o;
    } else if (!show && this.awayNotice) {
      this.awayNotice.removeFromParent(); this.awayNotice.element.remove(); this.awayNotice = null;
    }
  }

  /* ── labels ───────────────────────────────────────────────────────────── */

  makeLabel(a) {
    const e = el('div', 'tag');
    e.addEventListener('click', (ev) => { ev.stopPropagation(); this.select(a.id); });
    a.labelEl = e;
    if (!this.engine) return null;
    return this.engine.labels.attach(a.anchor, e);
  }

  reattachLabel(a) {
    if (!this.engine) return;
    if (a.label) { a.label.removeFromParent(); }
    a.label = this.engine.labels.attach(a.anchor, a.labelEl);
    this.refreshLabel(a);
  }

  refreshLabel(a) {
    const e = a.labelEl;
    if (!e) return;
    const s = a.struct, words = STATUS_WORDS[a.role.kind] || STATUS_WORDS.staff;
    const building = !is.built(s), online = is.online(s), hidden = is.hidden(s);
    let status = '';
    if (building) status = `<span class="chip build">${words.building}</span>`;
    else if (!online) status = `<span class="chip off">${words.offline}</span>`;
    else if (hidden) status = `<span class="chip hide">${words.hidden}</span>`;
    else if (s.protects) status = '<span class="chip cover">Covering</span>';
    const job = this.ctx.jobs?.get?.(s.id);
    const prog = building ? (s.build?.progress ?? job?.progress ?? 0) : (job && !job.stalled ? job.progress : null);
    const focus = this.selectedId === a.id || this.hoverId === a.id;
    const showMeter = this.mode === 'challenge' || (s.health < s.maxHealth);
    const meter = showMeter ? (s.maxHealth > 6
      ? `<div class="pips"><i class="pip heart on"></i><span class="num">${s.health}/${s.maxHealth}</span></div>`
      : `<div class="pips">${pips(s.health, s.maxHealth, 'heart')}</div>`) : '';
    const title = a.role.kind === 'equipment' ? a.role.role : `${a.name}`;
    const sub = a.role.kind === 'equipment' ? AREAS[s.ambit]?.name || '' : a.role.role;
    const bar = prog != null ? `<div class="bar"><i style="width:${Math.round(prog * 100)}%"></i></div>` : '';
    e.innerHTML = focus
      ? `<div class="tag-title"><b>${title}</b><small>${sub}</small></div>${status}${meter}${bar}`
      : this.mode === 'challenge'
        ? `${meter}${bar}`
        : `<div class="tag-title"><b>${title}</b></div>${status}${meter}${bar}`;
    const always = building || !online || this.mode === 'challenge' || s.health < s.maxHealth || prog != null;
    e.classList.toggle('show', always || focus);
    e.classList.toggle('selected', this.selectedId === a.id);
    e.classList.toggle('compact', !focus);
  }

  refreshJobs(jobs) {
    this.ctx.jobs = jobs;
    for (const a of this.actors.values()) if (jobs.has(a.id) || !is.built(a.struct)) this.refreshLabel(a);
  }

  say(a, text, ms) {
    if (!text || !a.character || !this.engine) return;
    this.engine.labels.say(a.character, text, { ms });
  }

  /* ── duties ───────────────────────────────────────────────────────────── */

  runDuty(a) {
    if (!a.character || a.leaving) return;
    if (!is.built(a.struct) || !is.online(a.struct)) return;
    const token = ++a.token;
    const key = isCommand(a.type) ? 'manage' : a.role.duty;
    let steps;
    try { steps = dutyFor(key)(a, this) || []; } catch (e) { steps = [{ wait: 2 }]; }
    this.runSteps(a, steps, token, () => this.after(0.2 + Math.random() * 0.6, () => { if (a.token === token) this.runDuty(a); }));
  }

  runSteps(a, steps, token, done) {
    if (a.token !== token || a.leaving) return;
    const step = steps.shift();
    if (!step) { done(); return; }
    const c = a.character;
    const next = () => this.runSteps(a, steps, token, done);
    if ('hold' in step && !step.gesture) c.hold(step.hold);
    if (step.walk) {
      if (a.place.outside && zoneOf(step.walk) !== 'outside') { next(); return; }
      c.walkTo(this.route(c.position, step.walk), next);
      return;
    }
    if (step.gesture) {
      this.actionSound(a, step);
      if ('hold' in step) c.hold(step.hold);
      if (step.face != null) c.face(step.face);
      if (step.look) c.faceTowards(step.look);
      if (step.fx) this.fx.emit(step.fx, step.at || tmpV.copy(c.position).setY(1.3), { count: step.fx === 'flash' ? 1 : 4, size: step.fx === 'flash' ? 1.2 : 0.3, up: step.fx === 'steam' ? 0.8 : 1.4 });
      c.play(step.gesture, step.dur || 1.5, next);
      return;
    }
    if (step.fx) { this.fx.emit(step.fx, step.at || tmpV.copy(c.position).setY(1.3), { count: 4 }); next(); return; }
    if (step.say) { this.say(a, step.say); next(); return; }
    if (step.wait) { this.after(step.wait, next); return; }
    next();
  }

  /** What a gesture sounds like for this role (sizzle, espresso, chop…), placed where the critter is. */
  actionSound(a, step) {
    if (this.opts.quiet || !this.engine || this.engine.active !== this || document.hidden) return;
    const duty = isCommand(a.type) ? 'manage' : a.role.duty;
    const g = step.gesture;
    const kind = {
      fry: 'sizzle', chop: 'chop', knead: 'knead', scrub: 'scrub', wipe: 'wipe', sweep: 'sweep', type: 'register',
      write: 'scribble', clap: 'clap', selfie: 'shutter', phone: 'tap', spin: 'whoosh', shake: 'shake', cheer: 'cheer', stir: 'stir',
      pour: duty === 'barista' ? 'espresso' : 'pour',
      serve: duty === 'bartend' ? 'glass' : duty === 'host' ? null : 'plate',
      lift: duty === 'scrub' ? 'clank' : duty === 'fry' ? 'slosh' : 'thud',
      carry: duty === 'bus' ? 'clank' : 'thud',
      wave: duty === 'cashier' ? 'till' : null,
    }[g];
    if (!kind) return;
    // Keep the kitchen from clattering: each critter is heard now and then, not every move.
    if (this.time < (a.nextSoundAt || 0) || Math.random() < 0.35) return;
    a.nextSoundAt = this.time + 7 + Math.random() * 8;
    const p = a.character.position;
    const scr = this.engine.toScreen(tmpV.set(p.x, 1, p.z));
    const onScreen = !scr.behind && scr.x > -40 && scr.x < this.engine.width + 40 && scr.y > -40 && scr.y < this.engine.height + 40;
    const dist = this.engine.camera.position.distanceTo(tmpV);
    const vol = Math.max(0.25, Math.min(1, 1.25 - (dist - 22) / 45)) * (onScreen ? 1 : 0.35);
    const pan = Math.max(-0.85, Math.min(0.85, (scr.x / (this.engine.width || 1)) * 2 - 1)) * 0.8;
    sfx.action(kind, { dur: step.dur || 1.5, pan, vol, cup: duty === 'barista' });
  }

  /** Interrupt someone's routine to do something now; their routine resumes after. */
  interrupt(a) { a.token++; if (a.character) { a.character.stop(); a.character.gesture = null; } }
  resume(a, delay = 0.6) { this.after(delay, () => this.runDuty(a)); }

  /* ── ambient life ─────────────────────────────────────────────────────── */

  startAmbient() {
    this.ambientStarted = true;
    const staff = [...this.actors.values()].filter((a) => a.character).length;
    const diners = Math.min(this.env.chairs.length, 3 + Math.round(staff / 2));
    const chairs = [...this.env.chairs].sort(() => this.r() - 0.5).slice(0, diners);
    chairs.forEach((ch, i) => this.spawnDiner(ch, true, i));
    this.after(4, () => this.dinerTurnover());
    this.after(1, () => this.passerBy());
    this.after(6, () => this.counterCustomer());
  }

  occupiedChairs() { return this.env.chairs.filter((c) => c.occupant && c.occupant.seated); }

  spawnDiner(chair, seated, i = 0) {
    const species = SPECIES[Math.floor(this.r() * SPECIES.length)];
    const c = new Character({ species, outfit: casualOutfit(this.r), seed: 'diner' + Math.random(), data: null });
    c.object.userData.character = null;
    c.hitbox.userData.character = null;
    const d = { c, chair, seated: false };
    chair.occupant = d;
    this.env.group.add(c.object);
    this.ambient.push(d);
    const seat = () => {
      c.setPosition(chair.pos.x, 0, chair.pos.z);
      c.face(chair.face); c.object.rotation.y = chair.face;
      c.sit(true, 0.5); d.seated = true;
      c.loop(this.r() < 0.5 ? 'eat' : 'talk');
      d.swap = this.time + 4 + this.r() * 6;
    };
    if (seated) seat();
    else {
      c.setPosition(DOOR.x + 4 + (this.r() - 0.5) * 6, 0, 9.8);
      c.walkTo(this.route(c.position, chair.pos), seat);
    }
    return d;
  }

  dinerTurnover() {
    if (this.mode === 'challenge') return;
    const seated = this.ambient.filter((d) => d.seated && d.chair);
    if (seated.length && this.r() < 0.55) {
      const d = seated[Math.floor(this.r() * seated.length)];
      d.seated = false; d.c.sit(false); d.c.loop(null);
      if (this.r() < 0.6) this.fx.emit('heart', tmpV.copy(d.c.position).setY(1.6), { count: 3 });
      const chair = d.chair; d.chair = null; chair.occupant = null;
      d.c.walkTo(this.routeAway(d.c.position, this.r() < 0.5 ? -1 : 1), () => this.removeAmbient(d));
      this.after(3 + this.r() * 4, () => {
        const free = this.env.chairs.filter((c) => !c.occupant);
        if (free.length && this.mode !== 'challenge') this.spawnDiner(free[Math.floor(this.r() * free.length)], false);
      });
    }
    this.after(7 + this.r() * 8, () => this.dinerTurnover());
  }

  counterCustomer() {
    if (this.mode === 'challenge') return;
    const cashier = [...this.actors.values()].find((a) => a.character && a.area === 'space' && is.online(a.struct) && is.built(a.struct));
    if (cashier) {
      const species = SPECIES[Math.floor(this.r() * SPECIES.length)];
      const c = new Character({ species, outfit: casualOutfit(this.r), seed: 'cc' + Math.random() });
      c.hitbox.userData.character = null;
      const d = { c };
      this.ambient.push(d);
      this.env.group.add(c.object);
      c.setPosition(DOOR.x - 6, 0, 9.8);
      // Between two bar stools (they're 1.65 apart, in front of each station), not on one.
      const spot = V(cashier.home.x + 0.82 + (this.r() - 0.5) * 0.2, 2.3);
      c.walkTo(this.route(c.position, spot), () => {
        c.face(Math.PI);
        c.play('talk', 2.2, () => {
          c.hold(this.r() < 0.5 ? 'coffee' : 'croissant');
          this.fx.emit('coin', tmpV.copy(spot).setY(1.4), { count: 2 });
          c.play('cheer', 0.7, () => c.walkTo(this.routeAway(c.position, 1), () => this.removeAmbient(d)));
        });
      });
    }
    this.after(9 + this.r() * 10, () => this.counterCustomer());
  }

  passerBy() {
    const species = SPECIES[Math.floor(this.r() * SPECIES.length)];
    const c = new Character({ species, outfit: casualOutfit(this.r), seed: 'pb' + Math.random(), speed: 1.3 + this.r() * 0.6 });
    c.hitbox.userData.character = null;
    if (this.r() < 0.3) c.hold(['coffee', 'phone', 'cone', 'crate'][Math.floor(this.r() * 4)]);
    const d = { c };
    this.ambient.push(d);
    this.env.group.add(c.object);
    const dir = this.r() < 0.5 ? 1 : -1;
    const z = 9.4 + this.r() * 1.2;
    c.setPosition(-24 * dir, 0, z);
    c.walkTo([V(-16.5 * dir, z), ...this.routeAway(V(-16.5 * dir, z), dir, z)], () => this.removeAmbient(d));
    this.after(3 + this.r() * 6, () => this.passerBy());
  }

  /**
   * You, visiting: walk in off the street through the front door, look
   * around and wave. Cleared with the rest of the ambient crowd.
   */
  visitorArrives({ species = 'cat', outfit = null, seed = 'visitor' } = {}) {
    const c = new Character({ species, outfit: outfit || casualOutfit(this.r), seed, speed: 2.2 });
    c.object.userData.character = null;
    c.hitbox.userData.character = null;
    const d = { c };
    this.ambient.push(d);
    this.env.group.add(c.object);
    c.setPosition(DOOR.x + 0.3, 0, 9.4);
    const spot = V(DOOR.x - 1.2 + this.r() * 0.8, 3.4);
    c.walkTo(this.route(c.position, spot), () => {
      c.face(0);
      c.play('wave', 1.4, () => c.loop('talk'));
    });
    return d;
  }

  removeAmbient(d) {
    d.c.dispose();
    this.ambient = this.ambient.filter((x) => x !== d);
  }

  clearAmbientInside() {
    for (const d of [...this.ambient]) if (d.chair || d.c.position.z < 6.6) { if (d.chair) d.chair.occupant = null; this.removeAmbient(d); }
  }

  /* ── picking ──────────────────────────────────────────────────────────── */

  pickables() {
    const out = [];
    for (const a of this.actors.values()) {
      if (a.character) out.push(a.character.hitbox);
      if (a.prop) out.push(a.prop);
      if (a.box) out.push(a.box);
    }
    return out;
  }

  pick(hit) {
    const id = hit?.data?.structId;
    if (id) this.select(id);
    else if (hit?.ground) this.dispatchEvent(new CustomEvent('ground', { detail: { point: hit.point } }));
    else this.select(null);
  }

  hover(hit) {
    const id = hit?.data?.structId || null;
    if (id === this.hoverId) return;
    const prev = this.actors.get(this.hoverId);
    this.hoverId = id;
    if (prev) this.refreshLabel(prev);
    const a = this.actors.get(id);
    if (a) this.refreshLabel(a);
  }

  select(id) {
    const prev = this.actors.get(this.selectedId);
    this.selectedId = id;
    if (prev) this.refreshLabel(prev);
    const a = this.actors.get(id);
    if (a) {
      this.refreshLabel(a);
      if (a.character) { a.character.hop(0.6); }
    }
    this.dispatchEvent(new CustomEvent('select', { detail: { id } }));
  }

  actorWorldPos(a, y = 1.1) {
    const src = a.character ? a.character.object : (a.prop || a.box);
    const p = new THREE.Vector3();
    if (src) src.getWorldPosition(p); else p.copy(a.home);
    p.y += y;
    return p;
  }

  /* ── reactions to game events ─────────────────────────────────────────── */

  onFx(ev) {
    const a = ev.structId ? this.actors.get(ev.structId) : null;
    switch (ev.kind) {
      case 'job':
        if (a) {
          const p = this.actorWorldPos(a, 1.6);
          this.fx.emit(ev.job === 'mine' ? 'recipe' : 'coin', p, { count: ev.job === 'mine' ? 3 : 5, size: 0.4, up: 2 });
          this.fx.emit('sparkle', p, { count: 6 });
          if (a.character) { a.character.hop(1); a.character.setMood('happy'); this.after(2, () => a.character.setMood(null)); }
          this.say(a, ev.job === 'mine' ? 'Eureka! A new recipe!' : 'Ka-ching!');
        }
        break;
      case 'hired':
        if (a) this.fx.emit('sparkle', this.actorWorldPos(a, 0.8), { count: 10, spread: 1 });
        break;
      case 'defense': {
        const d = this.actors.get(ev.defender), p = this.actors.get(ev.protected);
        if (d && p && ev.on && d.character) {
          this.say(d, `I’ve got your back, ${p.name}!`);
          this.fx.emit('star', this.actorWorldPos(p, 1.8), { count: 4 });
        }
        break;
      }
      case 'stealth':
        if (a) this.fx.emit('puff', this.actorWorldPos(a, 0.6), { count: 8, spread: 0.8, up: 0.8, size: 0.5 });
        break;
      case 'move':
        break;
      default: break;
    }
  }

  /* ── frame ────────────────────────────────────────────────────────────── */

  update(dt) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) { try { t.fn(); } catch (e) { console.warn(e); } }
      }
    }
    for (const o of this.env.ticks) o.userData.tick(dt, this.time);
    for (const a of this.actors.values()) {
      if (a.character) a.character.update(dt);
      if (a.prop?.userData.tick) a.prop.userData.tick(dt, this.time);
      if (a.character?.sleeping && Math.random() < dt * 0.6) this.fx.emit('zzz', this.actorWorldPos(a, 1.5), { count: 1, size: 0.25, up: 0.6, gravity: -0.2 });
    }
    for (const d of this.ambient) {
      d.c.update(dt);
      if (d.seated && d.swap && this.time > d.swap) { d.c.loop(this.r() < 0.5 ? 'eat' : 'talk'); d.swap = this.time + 4 + this.r() * 6; }
    }
    this.fx.update(dt);
  }

  dispose() {
    for (const a of [...this.actors.values()]) this.removeActor(a);
    this.ambient.forEach((d) => d.c.dispose());
    this.ambient = [];
    this.fx.clear();
  }
}
