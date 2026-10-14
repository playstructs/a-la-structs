/**
 * A service challenge. The host restaurant is the battleground; the visiting
 * crew sit down as customers. Serving a customer satisfies a need (damage to
 * the challenger's struct); a customer's complaint costs an employee morale
 * (damage to the host's struct). Satisfied customers leave happy; employees
 * who run out of morale are fired and walk out with their box.
 */
import * as THREE from 'three';
import { RestaurantScene } from './RestaurantScene.js';
import { Character } from '../Character.js';
import { OUTFITS } from '../outfits.js';
import { el, pips } from '../labels.js';
import { V, CUSTOMER_SPOTS, CUSTOMER_FACE, CUSTOMER_SEAT, route, DOOR } from '../layout.js';
import { roleOf } from '../../lexicon/roles.js';
import { nameFor, speciesFor } from '../../lexicon/names.js';
import { is, isCommand } from '../../game/model.js';
import { AREAS } from '../../lexicon/areas.js';

const tmp = new THREE.Vector3();

export class ChallengeScene extends RestaurantScene {
  constructor(opts) {
    super({ ...opts, mode: 'challenge', ambient: true });
    this.scene.background = new THREE.Color('#ffd9b8');
    this.scene.fog.color.set('#ffd9b8');
    this.targeting = null;   // { attackerId, ws, valid:Set }
  }

  enter(engine) {
    super.enter(engine);
    this.clearAmbientInside();
  }

  placementKey(s, t) {
    if (this.sideOf(s) === 'guest') return `guest:${s.ambit}:${isCommand(t) ? 'critic' : s.slot}`;
    return super.placementKey(s, t);
  }

  addActor(s, t) {
    if (this.sideOf(s) !== 'guest') return super.addActor(s, t);
    // A customer!
    const role = roleOf(t);
    const area = s.ambit || 'air';
    const spots = CUSTOMER_SPOTS[area] || CUSTOMER_SPOTS.air;
    const critic = isCommand(t);
    const spot = (critic ? spots[4] : spots[s.slot % 4]).clone();
    const persona = role.customer || { persona: 'Customer', outfit: 'casual' };
    const species = critic && this.ctx.guestSpecies ? this.ctx.guestSpecies : speciesFor(s.id);
    const a = {
      id: s.id, struct: s, type: t, role, area, side: 'guest', customer: true, critic,
      home: spot, place: { stand: spot, face: CUSTOMER_FACE[area] }, placementKey: this.placementKey(s, t),
      name: nameFor(s.id), species, persona: persona.persona, token: 0, leaving: false,
    };
    a.character = new Character({ species, outfit: OUTFITS[persona.outfit] || OUTFITS.casual, seed: critic ? s.owner : s.id, data: { structId: s.id }, scale: critic ? 1.12 : 1 });
    const c = a.character;
    this.env.group.add(c.object);
    // They walk in from the street and take their seat.
    c.setPosition(DOOR.x + (Math.random() - 0.5) * 3, 0, 10.5 + Math.random());
    const seated = !critic;
    c.walkTo([V(DOOR.x, 9.4), ...route(V(DOOR.x, 6.0), spot)], () => {
      c.face(a.place.face); c.object.rotation.y = a.place.face;
      if (seated) c.sit(true, CUSTOMER_SEAT[area]);
      c.loop(critic ? 'write' : 'talk');
      if (!this.firstLine) { this.firstLine = true; this.say(a, critic ? 'I’ll be the judge of that.' : 'Excuse me!'); }
    });
    a.anchor = c.anchor;
    a.label = this.makeLabel(a);
    this.actors.set(s.id, a);
    this.updateActor(a, s, t, true);
    return a;
  }

  moveActor(a, s, t) {
    if (!a.customer) return super.moveActor(a, s, t);
    const area = s.ambit || 'air';
    const spot = (CUSTOMER_SPOTS[area] || CUSTOMER_SPOTS.air)[4].clone();
    a.area = area; a.home = spot; a.place = { stand: spot, face: CUSTOMER_FACE[area] }; a.placementKey = this.placementKey(s, t);
    a.struct = s;
    const c = a.character;
    c.loop(null); c.sit(false);
    this.say(a, `Let’s see the ${AREAS[area].name}…`, 1800);
    c.walkTo(route(c.position, spot), () => { c.face(a.place.face); c.loop('write'); });
    this.refreshLabel(a);
  }

  updateActor(a, s, t, fresh = false) {
    if (!a.customer) {
      super.updateActor(a, s, t, fresh);
      if (is.destroyed(s) && !a.leaving) this.fire(a);
      return;
    }
    const prev = a.struct;
    a.struct = s;
    a.character.setHidden(is.hidden(s));
    if (prev && prev.health > s.health && !fresh) {
      a.character.setMood('happy');
      this.after(1.6, () => a.character.setMood(null));
    }
    if (is.destroyed(s) && !a.leaving) this.satisfied(a);
    this.refreshLabel(a);
  }

  refreshLabel(a) {
    if (!a.customer) {
      super.refreshLabel(a);
      const e = a.labelEl;
      if (e) {
        e.classList.toggle('targetable', !!this.targeting?.valid.has(a.id));
        e.classList.toggle('dim', !!this.targeting && !this.targeting.valid.has(a.id) && a.id !== this.targeting.attackerId);
      }
      return;
    }
    const e = a.labelEl;
    if (!e) return;
    const s = a.struct;
    const met = s.maxHealth - s.health;
    const pct = Math.round(100 * met / s.maxHealth);
    const status = !is.online(s) ? '<span class="chip off">Napping</span>' : is.hidden(s) ? '<span class="chip hide">Blending in</span>' : s.protects ? '<span class="chip cover">Backing up a friend</span>' : '';
    const focus = this.selectedId === a.id || this.hoverId === a.id;
    e.innerHTML = focus
      ? `<div class="tag-title"><b>${a.critic ? 'Food Critic' : a.persona}</b><small>${AREAS[a.area]?.customerSpot || ''}</small></div>${status}<div class="need"><span>Satisfied</span><div class="bar sat"><i style="width:${pct}%"></i></div></div>`
      : `<div class="tag-title"><b>${a.critic ? 'Food Critic' : a.persona}</b></div><div class="bar sat"><i style="width:${pct}%"></i></div>`;
    e.classList.toggle('compact', !focus);
    e.classList.add('show', 'customer');
    e.classList.toggle('critic', !!a.critic);
    e.classList.toggle('selected', this.selectedId === a.id);
    e.classList.toggle('targetable', !!this.targeting?.valid.has(a.id));
    e.classList.toggle('dim', !!this.targeting && !this.targeting.valid.has(a.id) && a.id !== this.targeting.attackerId);
  }

  /** Highlight who the selected employee can serve. */
  setTargeting(t) {
    this.targeting = t;
    for (const a of this.actors.values()) this.refreshLabel(a);
  }

  /** Employee-side labels also dim while targeting. */
  refreshEmployeeTargeting() { for (const a of this.actors.values()) if (!a.customer) this.refreshLabel(a); }

  satisfied(a) {
    a.leaving = true;
    a.token++;
    const c = a.character;
    this.after(1.1, () => {
      c.loop(null); c.sit(false); c.setMood('happy');
      this.fx.emit('heart', this.actorWorldPos(a, 1.6), { count: 10, spread: 0.8, up: 2.2 });
      this.fx.emit('confetti', this.actorWorldPos(a, 1.4), { count: 14, spread: 1 });
      this.say(a, a.critic ? 'Exquisite. Five stars. We’re leaving!' : 'Perfect! Thank you!', 2500);
      c.play('cheer', 1.4, () => {
        c.walkTo([...route(c.position, V(DOOR.x, 6.2)), V(DOOR.x, 9.6), V(DOOR.x + 20, 10)], () => this.removeActor(a));
      });
    });
  }

  fire(a) {
    a.leaving = true;
    a.token++;
    const c = a.character;
    this.after(1.0, () => {
      const p = this.actorWorldPos(a, 2.0);
      if (this.engine) this.engine.labels.pop(this.scene, p, a.role.kind === 'equipment' ? 'BROKEN!' : 'FIRED!', 'fired');
      if (!c) {
        if (a.prop) { this.fx.emit('dust', p.setY(0.6), { count: 12, spread: 1.2, up: 0.8, size: 0.6 }); a.prop.rotation.z = 0.15; a.prop.scale.y = 0.85; }
        return;
      }
      c.stop(); c.gesture = null; c.loop(null); c.sleep(false); c.sit(false);
      c.hold('box', 'R');
      c.play('sad', 1.4, () => {
        this.say(a, 'I’ll go…', 1600);
        c.speed = 1.2;
        c.walkTo([...route(c.position, V(DOOR.x, 6.2)), V(DOOR.x, 9.6), V(DOOR.x - 20, 10)], () => this.removeActor(a));
      });
    });
  }

  /* ── combat animation ─────────────────────────────────────────────────── */

  onFx(ev) {
    if (ev.kind === 'attack') return this.playAttack(ev.detail);
    if (ev.kind === 'deflect') return this.playDeflect(ev);
    return super.onFx(ev);
  }

  posOf(id, y = 1.1) { const a = this.actors.get(id); return a ? this.actorWorldPos(a, y) : null; }

  playAttack(d) {
    const att = this.actors.get(d.attackerStructId);
    const rows = d.eventAttackShotDetail || [];
    if (!att || !rows.length) return;
    const hostSide = att.side === 'host';
    const role = roleOf(att.type);
    const action = (hostSide ? role.serve : role.complain)?.[d.weaponSystem];
    const dish = action?.dish || (d.weaponSystem === 'planetaryDefenses' ? 'plate' : 'plate');
    const last = rows[rows.length - 1];
    const targetId = last.blocked ? last.blockedByStructId : last.targetStructId;
    const target = this.actors.get(targetId);
    const shots = Math.max(1, rows.length);

    if (att.character) {
      this.interrupt(att);
      if (target) att.character.faceTowards(target.character ? target.character.position : target.home);
      att.character.play(hostSide ? 'throw' : 'angry', hostSide ? 0.6 : 1.0);
      this.say(att, hostSide ? (action?.name || 'Here you go!') : (action?.name || 'Hey!'), 1800);
    }
    if (last.blocked) {
      const blocker = this.actors.get(last.blockedByStructId);
      const orig = this.actors.get(last.targetStructId);
      if (blocker?.character && orig) {
        this.interrupt(blocker);
        const between = (orig.character ? orig.character.position : orig.home).clone();
        blocker.character.walkTo([between.add(V(0.5, 0.5))], () => this.resume(blocker, 1.5));
        this.say(blocker, hostSide ? 'Let me take this one!' : 'I’ll handle it!', 1500);
      }
    }
    const from = this.posOf(att.id, 1.3);
    const to = target ? this.posOf(target.id, 1.2) : null;
    if (!from || !to) return;
    let landed = 0;
    for (let i = 0; i < shots; i++) {
      const row = rows[i];
      this.after(0.25 + i * 0.28, () => {
        this.fx.fly({
          from, to, item: hostSide ? dish : null, sprite: hostSide ? null : 'puff', dur: 0.75, height: hostSide ? 1.4 : 0.9,
          onHit: () => this.landShot(att, target, row, hostSide, i === shots - 1, d),
        });
        landed++;
      });
    }
    // counters (defenders and the target answering back)
    const counters = [...(last.eventAttackDefenderCounterDetail || [])];
    if (last.targetCountered) counters.push({ counterByStructId: last.targetStructId, counterDamage: last.targetCounteredDamage });
    counters.forEach((cd, j) => this.after(1.3 + shots * 0.28 + j * 0.45, () => {
      const ca = this.actors.get(cd.counterByStructId);
      if (!ca) return;
      const f = this.posOf(ca.id, 1.3), t2 = this.posOf(att.id, 1.2);
      if (!f || !t2) return;
      const counterHost = ca.side === 'host';
      if (ca.character) { ca.character.faceTowards(att.character ? att.character.position : att.home); ca.character.play(counterHost ? 'throw' : 'angry', 0.6); }
      this.say(ca, counterHost ? 'Quick fix!' : 'And another thing!', 1300);
      this.fx.fly({ from: f, to: t2, item: counterHost ? 'napkin' : null, sprite: counterHost ? null : 'angry', dur: 0.55, height: 0.8, onHit: () => this.hitReaction(att, cd.counterDamage, counterHost) });
    }));
    if (att.character) this.resume(att, 2.2 + counters.length * 0.5);
  }

  landShot(att, target, row, hostSide, isLast) {
    if (!target) return;
    const p = this.posOf(target.id, 1.7);
    if (row.evaded) {
      this.engine?.labels.pop(this.scene, p, hostSide ? 'Changed their mind!' : 'Shrugged it off!', 'miss');
      if (target.character) target.character.hop(0.5);
      this.fx.emit('dust', p.clone().setY(0.4), { count: 5, size: 0.4, up: 0.6 });
      return;
    }
    const dmg = isLast ? (row.damage ?? row.damageDealt ?? 0) : (row.damageDealt ?? 0);
    if (dmg > 0 || isLast) this.hitReaction(target, dmg, hostSide, row);
  }

  hitReaction(target, dmg, servedByHost) {
    const p = this.posOf(target.id, 1.7);
    if (!p) return;
    if (servedByHost) {
      // a customer got something they wanted
      this.fx.emit('heart', p, { count: 3 + dmg * 2, up: 1.6 });
      if (dmg > 0) this.engine?.labels.pop(this.scene, p, `+${dmg} satisfied`, 'good');
      if (target.character) { target.character.setMood('happy'); target.character.hop(0.5); this.after(1.5, () => target.character?.setMood(null)); }
    } else {
      // an employee took a complaint
      this.fx.emit('angry', p, { count: 2, up: 0.8, size: 0.4 });
      this.fx.emit('sweat', p, { count: 3, up: 1.0, size: 0.25 });
      if (dmg > 0) this.engine?.labels.pop(this.scene, p, `−${dmg} morale`, 'bad');
      if (target.character) { target.character.wobble(1); target.character.setMood('sad'); this.after(1.5, () => target.character?.setMood(null)); }
      else if (target.prop) { target.prop.position.x += 0.05; this.after(0.15, () => { target.prop.position.x -= 0.05; }); }
    }
  }

  playDeflect(ev) {
    const att = this.actors.get(ev.attackerId), tgt = this.actors.get(ev.targetId);
    if (!att || !tgt) return;
    const from = this.posOf(att.id, 1.3), to = this.posOf(tgt.id, 1.2);
    const cat = [...this.actors.values()].find((a) => a.type?.type === 'Jamming Satellite' && !is.destroyed(a.struct));
    if (att.character) att.character.play('angry', 0.8);
    const mid = from.clone().lerp(to, 0.6);
    this.fx.fly({ from, to: mid, sprite: 'puff', dur: 0.5, height: 0.6, onHit: () => {
      this.fx.emit('sparkle', mid, { count: 10 });
      this.engine?.labels.pop(this.scene, mid, 'Lucky Cat deflected it!', 'good');
      if (cat?.prop) this.fx.emit('star', this.actorWorldPos(cat, 1.6), { count: 6 });
    } });
  }
}
