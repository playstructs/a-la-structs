/**
 * Your restaurant group: its profile, members, the other groups in town and
 * the group bank. In Structs terms: the Guild menu — guild profile, member
 * roster, guilds directory and the reactor (infuse / defuse Alpha).
 */
import { h, icon, copyButton } from './dom.js';
import { ownerFace } from './panels.js';
import { tile, loading, navTile, stepper } from './widgets.js';
import { gold, cash } from '../game/model.js';
import { bankTakings } from '../services/Service.js';

const pct = (x) => `${Math.round((x || 0) * 100)}%`;

function groupCard(app, g) {
  return h('div', { class: 'group-card' },
    h('div', { class: 'group-banner' },
      g.logo ? h('img', { src: g.logo, alt: '', referrerpolicy: 'no-referrer' }) : icon('group', 'pennant'),
      h('div', {}, h('h3', {}, g.name), h('div', { class: 'sub' }, [g.tag && `[${g.tag}]`, `Group #${g.id}`].filter(Boolean).join(' · ')))),
    g.description ? h('p', {}, g.description) : null,
    h('div', { class: 'tabs' },
      copyButton(g.id, 'Copy group no.'),
      g.website ? h('a', { class: 'chip-btn', href: g.website, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), 'Website') : null,
      g.discord ? h('a', { class: 'chip-btn', href: g.discord, target: '_blank', rel: 'noopener noreferrer' }, icon('chat'), 'Join their Discord') : null));
}

function groupStats(g) {
  return [
    h('div', { class: 'section-title' }, 'Members'),
    h('div', { class: 'facts three' },
      tile('staff', 'Owners', g.members),
      tile('store', 'Restaurants run dry', g.restaurantsCompleted),
      tile('cash', 'Avg. base takings', g.avgTakings == null ? null : cash(g.avgTakings), 'per owner, per tick')),
    h('div', { class: 'section-title' }, 'The group bank'),
    h('div', { class: 'facts three' },
      tile('bank', 'Gold deposited', g.invested == null ? null : gold(g.invested)),
      tile('cash', 'Cash it supplies', g.takings == null ? null : cash(g.takings), g.payroll == null ? null : `${cash(g.payroll)} in use`),
      tile('gold', 'Join minimum', gold(g.joinMinimum), 'gold to keep deposited'),
      tile('hustle', 'Bank rate', `${cash(g.ratio)} / gold`, 'cash per tick for each gold'),
      tile('ledger', 'Group’s cut', pct(g.commission), 'of what the bank pays out')),
  ];
}

const index = {
  title: 'Your group',
  load: (app) => app.svc.groupProfile(app.svc.state.me.guildId),
  render(app, g) {
    return {
      body: [
        groupCard(app, g),
        h('div', { class: 'nav-tiles' },
          navTile('bank', 'Group bank', 'Deposit gold, earn steady takings', () => app.openPage('group', 'bank')),
          navTile('staff', 'Members', g.members == null ? 'Everyone in the group' : `${g.members} owners`, () => app.openPage('group', 'members', { id: g.id, name: g.name })),
          navTile('town', 'Groups in town', 'Every restaurant group', () => app.openPage('group', 'directory'))),
        ...groupStats(g),
      ],
      foot: [h('button', { class: 'btn small sea', onclick: () => { app.closeSheet(); app.setView('town'); } }, icon('town'), 'Walk around town')],
    };
  },
};

const profile = {
  title: 'Restaurant group',
  load: (app, { id }) => app.svc.groupProfile(id),
  render(app, g) {
    if (g.isMine) return index.render(app, g);
    return {
      body: [
        groupCard(app, g),
        h('div', { class: 'note' }, 'Owners in this group play through the group’s own game. You can still visit their restaurants and send your crew over for a service challenge.'),
        navTile('staff', 'Members', g.members == null ? 'Everyone in the group' : `${g.members} owners`, () => app.openPage('group', 'members', { id: g.id, name: g.name })),
        ...groupStats(g),
      ],
      foot: [h('button', { class: 'btn small berry', onclick: () => app.openRivals({ groupId: g.id }) }, icon('bell'), 'Find rivals in this group')],
    };
  },
};

function statusBadge(m) {
  if (m.underChallenge) return h('span', { class: 'tagchip bad' }, 'Mid-challenge');
  if (!m.crewHome) return h('span', { class: 'tagchip' }, 'Crew out');
  return h('span', { class: 'tagchip good' }, 'Open for service');
}

const members = {
  title: (app, _d, p) => (p.name ? `${p.name} · members` : 'Members'),
  load: (app, { id }) => app.svc.groupMembers(id),
  render(app, list) {
    const sorted = [...list].sort((a, b) => (b.isMe - a.isMe) || b.recipes - a.recipes);
    return {
      body: [
        h('p', {}, `${list.length} owner${list.length === 1 ? '' : 's'}. Tap one to see their card.`),
        ...sorted.map((m) => h('button', { class: `card card-btn ${m.isMe ? 'mine' : ''}`, onclick: () => app.openPage('office', m.isMe ? 'index' : 'profile', { id: m.id }) },
          h('img', { class: 'portrait', src: ownerFace(app, m.id, m.species), alt: '' }),
          h('div', {}, h('h3', {}, m.isMe ? `${m.name} (you)` : m.name), h('div', { class: 'sub' }, m.restaurantName || 'Looking for a location'),
            h('div', { class: 'chips' }, h('span', { class: 'tagchip' }, icon('recipe'), `${m.recipes} recipes`), statusBadge(m))))),
      ],
    };
  },
};

const directory = {
  title: 'Groups in town',
  load: (app) => app.svc.groupDirectory(),
  render(app, list) {
    const top = Math.max(1, ...list.map((g) => g.gold || 0));
    return {
      body: [
        h('p', {}, 'Every restaurant group, richest first.'),
        ...[...list].sort((a, b) => b.gold - a.gold).map((g, i) => h('button', { class: `card card-btn group-row ${g.isMine ? 'mine' : ''}`, onclick: () => app.openPage('group', 'profile', { id: g.id }) },
          h('span', { class: 'rank' }, `${i + 1}`),
          h('div', {}, h('h3', {}, g.name, g.isMine ? h('small', { class: 'you' }, ' your group') : null),
            h('div', { class: 'sub' }, `${g.members} owners · ${gold(g.gold)} gold`),
            h('div', { class: 'progress butter thin' }, h('i', { style: { width: `${Math.round((g.gold / top) * 100)}%` } }))))),
      ],
    };
  },
};

/**
 * The group bank: pick how much you want deposited and see what it pays.
 * Depositing is MsgReactorInfuse; withdrawing is MsgReactorDefuse, and the
 * withdrawn gold clears (cools down) before you can spend it.
 */
const bank = {
  title: 'Group bank',
  load: (app) => app.svc.bank(),
  render(app, b) {
    const st = app.svc.state;
    const wallet = st.wallet.gold;
    const max = b.invested + wallet;
    const min = Math.min(b.invested, b.joinMinimum);
    const d = app.bankDraft ??= { target: b.invested };
    d.target = Math.max(min, Math.min(max, d.target));
    const delta = d.target - b.invested;
    const after = bankTakings(d.target, b);
    const now = b.takings || bankTakings(b.invested, b);
    const range = h('input', { type: 'range', id: 'bank-range', min: String(min), max: String(max), value: String(d.target), 'aria-label': 'Gold to keep in the bank' });
    const out = h('div', { class: 'bank-preview' });
    const paint = () => {
      const dd = d.target - b.invested, tk = bankTakings(d.target, b);
      out.replaceChildren(
        h('div', {}, h('small', {}, 'Deposited'), h('b', {}, gold(d.target))),
        h('div', { class: dd > 0 ? 'up' : dd < 0 ? 'down' : '' }, h('small', {}, dd >= 0 ? 'Deposit' : 'Withdraw'), h('b', {}, `${dd > 0 ? '+' : dd < 0 ? '−' : ''}${gold(Math.abs(dd))}`)),
        h('div', {}, h('small', {}, 'Takings'), h('b', {}, `${cash(tk)}/tick`)));
      go.disabled = dd === 0;
      go.className = `btn small ${dd < 0 ? 'berry' : 'butter'}`;
      go.lastChild.textContent = dd > 0 ? `Deposit ${gold(dd)} gold` : dd < 0 ? `Withdraw ${gold(-dd)} gold` : 'Move the slider';
    };
    const go = h('button', { class: 'btn small butter', onclick: () => {
      const dd = d.target - b.invested;
      const text = dd > 0
        ? `${gold(dd)} gold leaves your wallet and goes into ${st.me.guildName || 'the group'}’s bank. Your takings go to about ${cash(bankTakings(d.target, b))} per tick.`
        : `${gold(-dd)} gold comes out of the bank. It has to clear before you can spend it, and your takings drop to about ${cash(bankTakings(d.target, b))} per tick.`;
      app.confirm(dd > 0 ? 'Deposit gold?' : 'Withdraw gold?', text, dd > 0 ? 'Deposit' : 'Withdraw', () => app.act(async () => {
        if (dd > 0) await app.svc.bankDeposit(dd); else await app.svc.bankWithdraw(-dd);
        app.bankDraft = null;
        await app.reloadPage();
      }));
    } }, icon('bank'), h('span', {}, ''));
    range.addEventListener('input', () => { d.target = Number(range.value); paint(); });
    paint();
    return {
      body: [
        h('div', { class: 'vault' },
          h('div', {}, h('small', {}, 'Your deposit'), h('b', {}, icon('gold'), gold(b.invested))),
          h('div', {}, h('small', {}, 'Takings it brings'), h('b', {}, icon('cash'), `${cash(now)}/tick`)),
          h('div', { class: b.clearing ? 'clearing' : '' }, h('small', {}, 'Clearing'), h('b', {}, icon('clock'), gold(b.clearing)), b.clearing && b.clearingTicks ? h('span', { class: 'tile-note' }, `ready in ${b.clearingTicks} ticks`) : null)),
        h('div', { class: 'field' }, h('label', { for: 'bank-range' }, 'How much do you want deposited?'), range,
          h('div', { class: 'range-ends' }, h('span', {}, `${gold(min)}${b.joinMinimum && min === b.joinMinimum ? ' (minimum)' : ''}`), h('span', {}, `${gold(max)} (everything)`))),
        out,
        delta === 0 && wallet === 0 && b.invested <= b.joinMinimum ? h('div', { class: 'note' }, 'Nothing to move yet: your wallet is empty and the rest has to stay in the bank.') : null,
        h('div', { class: 'section-title' }, 'How the bank works'),
        h('ul', { class: 'rules' },
          h('li', {}, `Every gold deposited pays about ${cash(b.ratio * (1 - b.commission))} in takings each tick, after the group’s ${pct(b.commission)} cut.`),
          h('li', {}, b.joinMinimum ? `Members keep at least ${gold(b.joinMinimum)} gold deposited.` : 'There’s no minimum deposit.'),
          h('li', {}, 'Withdrawn gold clears first — it shows as Clearing until you can spend it.')),
      ],
      foot: [go],
    };
  },
  leave(app) { app.bankDraft = null; },
};

export const GROUP = { index, profile, members, directory, bank };
