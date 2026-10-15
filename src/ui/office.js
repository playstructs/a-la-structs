/**
 * The Office: your owner card, the key ring (devices signed in as you),
 * sending gold and the ledger. In Structs terms: the Account menu — profile,
 * devices and activation codes, Alpha transfers and transaction history.
 *
 * Each page is { title, load?(app, params), render(app, data, params), leave?(app) };
 * App.openPage() loads and renders them inside the side sheet.
 */
import { h, icon, keyFob, copyButton, shortAddress, fmtDate, fmtWhen } from './dom.js';
import { ownerFace } from './panels.js';
import { stepper, pager, toggle, tile, loading, navTile } from './widgets.js';
import { gold, cash } from '../game/model.js';
import { nameProblem } from '../services/Service.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ── owner card ─────────────────────────────────────────────────────────── */

function ownerCard(app, p) {
  const name = h('h3', {}, p.name);
  if (p.isMe) name.append(h('button', { class: 'icon-btn', 'aria-label': 'Change your name', title: 'Change your name', onclick: () => app.openPage('office', 'rename') }, icon('pencil')));
  return h('div', { class: 'owner-card' },
    h('div', { class: 'owner-card-top' },
      h('img', { src: ownerFace(app, p.id, p.species), alt: '' }),
      h('div', {}, name,
        h('div', { class: 'sub' }, p.restaurantName ? `Owner of ${p.restaurantName}` : 'Between restaurants'),
        p.guildName ? h('button', { class: 'tagchip link', onclick: () => app.openPage('group', p.isMe ? 'index' : 'profile', { id: p.guildId }) }, icon('group'), p.guildTag ? `[${p.guildTag}] ${p.guildName}` : p.guildName) : null)),
    h('dl', { class: 'ids' },
      h('div', {}, h('dt', {}, 'Owner no.'), h('dd', {}, `#${p.id}`), copyButton(p.id)),
      p.address ? h('div', {}, h('dt', {}, 'Address'), h('dd', { title: p.address }, shortAddress(p.address)), copyButton(p.address)) : null));
}

function money(p) {
  const spare = p.takings - p.payroll;
  return [
    h('div', { class: 'section-title' }, 'Money'),
    h('div', { class: 'facts three' },
      tile('gold', 'In the wallet', gold(p.gold)),
      tile('bank', 'In the bank', gold(p.invested)),
      tile('cash', 'Cash flow', `${spare < 0 ? '−' : '+'}${cash(Math.abs(spare))}`, `${cash(p.takings)} in · ${cash(p.payroll)} out`)),
  ];
}

function trackRecord(p) {
  return [
    h('div', { class: 'section-title' }, 'Track record'),
    h('div', { class: 'facts three' },
      tile('store', 'Restaurants run dry', p.restaurantsCompleted),
      tile('bell', 'Challenges started', p.challengesLaunched),
      tile('mystery', 'Recipes discovered', p.recipesFound),
      tile('recipe', 'Recipes copied', p.recipesCopied),
      tile('grumble', 'Recipes lost', p.recipesLost)),
  ];
}

/* ── pages ──────────────────────────────────────────────────────────────── */

const index = {
  title: 'The Office',
  load: (app) => app.svc.getProfile(),
  render(app, p) {
    const live = app.svc.mode === 'live';
    return {
      body: [
        ownerCard(app, p),
        h('div', { class: 'nav-tiles' },
          navTile('key', 'Key ring', 'The devices signed in as you', () => app.openPage('office', 'keys')),
          navTile('send', 'Send gold', `You have ${gold(p.gold)}`, () => app.openPage('office', 'send')),
          navTile('ledger', 'Ledger', 'Every gold coin in and out', () => app.openPage('office', 'ledger', { page: 1 })),
          navTile('bank', 'Group bank', 'Deposit gold for steady takings', () => app.openPage('group', 'bank'))),
        ...money(p), ...trackRecord(p),
      ],
      foot: [live
        ? h('button', { class: 'btn ghost small', onclick: () => app.signOutFlow() }, icon('out'), 'Sign out on this browser')
        : h('button', { class: 'btn ghost small', onclick: () => app.leaveDemo() }, icon('out'), 'Back to title')],
    };
  },
};

const profile = {
  title: (app, p) => (p ? `${p.name}’s card` : 'Owner card'),
  load: (app, { id }) => app.svc.getProfile(id),
  render(app, p) {
    if (p.isMe) return index.render(app, p);
    return {
      body: [ownerCard(app, p), ...money(p), ...trackRecord(p)],
      foot: [
        h('button', { class: 'btn small butter', onclick: () => app.openPage('office', 'send', { to: { id: p.id, address: p.address, name: p.name, species: p.species, guildName: p.guildName, guildTag: p.guildTag, restaurantName: p.restaurantName } }) }, icon('send'), 'Send gold'),
        p.restaurantName ? h('button', { class: 'btn small ghost', onclick: () => app.peek(p.id, p.guildId !== app.svc.state.me.guildId) }, 'Visit their restaurant') : null,
      ],
    };
  },
};

const rename = {
  title: 'Your name on the door',
  render(app) {
    const st = app.svc.state;
    app.drafts.rename ??= st.me.name;
    const err = h('div', { class: 'note warn', hidden: true });
    const inp = h('input', { id: 'rename-input', value: app.drafts.rename, maxlength: '20', autocomplete: 'off', spellcheck: 'false' });
    const hint = h('small', {}, '3–20 letters, numbers, - or _.');
    const go = h('button', { class: 'btn small', type: 'submit' }, icon('pencil'), 'Change it');
    const check = () => { const why = nameProblem(inp.value); hint.textContent = why || 'Looks good.'; hint.className = why ? 'bad' : 'good'; go.disabled = !!why || inp.value.trim() === st.me.name; };
    inp.addEventListener('input', () => { app.drafts.rename = inp.value; check(); });
    check();
    const form = h('form', { class: 'field', onsubmit: async (e) => {
      e.preventDefault();
      go.disabled = true; go.lastChild.textContent = 'Sending…'; err.hidden = true;
      try { await app.svc.rename(inp.value); app.drafts.rename = null; app.prefs.name = app.svc.state.me.name; app.savePrefs(); app.afterRename(); app.pageBack(); }
      catch (x) { err.textContent = app.svc.friendlyError(x); err.hidden = false; go.lastChild.textContent = 'Change it'; check(); }
    } }, h('label', { for: 'rename-input' }, 'Owner name'), h('div', { class: 'inline' }, inp, go), hint);
    return { body: [
      h('p', {}, app.svc.mode === 'live'
        ? 'This is the name everyone sees — on your restaurant, in town and in rival owners’ games. It’s saved with your group, so it changes on every device.'
        : 'This is the name on your door and in town.'),
      form, err,
    ] };
  },
};

/* ── keys (devices) ─────────────────────────────────────────────────────── */

function keyChips(k) {
  return [
    k.isPrimary ? h('span', { class: 'tagchip gold' }, icon('key'), 'Main key') : null,
    k.canManage ? h('span', { class: 'tagchip' }, 'Manages keys') : null,
    k.canSend ? h('span', { class: 'tagchip' }, icon('gold'), 'Sends gold') : null,
  ];
}

const keys = {
  title: 'Key ring',
  load: (app) => app.svc.listKeys(),
  render(app, list) {
    const me = list.find((k) => k.isThis);
    const rows = list.map((k) => h('button', { class: 'card card-btn key-row', onclick: () => app.openPage('office', 'key', { address: k.address }) },
      keyFob(k.address, 'portrait'),
      h('div', {},
        h('h3', {}, k.isThis ? 'This browser' : k.label),
        h('div', { class: 'sub' }, k.isThis ? k.label : `Last used ${fmtWhen(k.lastActive)}${k.ip ? ` · ${k.ip}` : ''}`),
        h('div', { class: 'chips' }, ...keyChips(k)))));
    return {
      body: [
        h('p', {}, 'Every device signed in to your restaurant carries its own key. Cut a new key to sign in on a phone or another computer — no recovery phrase needed.'),
        ...rows,
      ],
      foot: [
        h('button', { class: 'btn small', disabled: !me?.canManage, title: me?.canManage ? null : 'This key can’t cut new keys', onclick: () => app.openPage('office', 'cut') }, icon('key'), 'Cut a new key'),
        me && !me.canManage ? h('small', { class: 'why' }, 'Only a key that manages keys can cut new ones.') : null,
      ],
    };
  },
};

const key = {
  title: 'Key',
  async load(app, { address }) {
    const list = await app.svc.listKeys();
    const k = list.find((x) => x.address === address) || await app.svc.keyDetails(address);
    const me = list.find((x) => x.isThis) || k;
    return { key: k, me, managers: list.filter((x) => x.canManage).length };
  },
  render(app, d) {
    const { key: k, me } = d;
    const editable = me.canManage && !k.isPrimary;
    const draft = app.drafts.key?.address === k.address ? app.drafts.key : (app.drafts.key = { address: k.address, manage: k.canManage, send: k.canSend });
    const changed = draft.manage !== k.canManage || draft.send !== k.canSend;
    const lastManager = k.canManage && d.managers === 1;
    const body = [
      h('div', { class: 'hero' }, keyFob(k.address, 'big'), h('div', {},
        h('h3', {}, k.isThis ? 'This browser' : k.label),
        h('div', { class: 'sub' }, k.isThis ? k.label : `Last used ${fmtWhen(k.lastActive)}`),
        h('div', { class: 'chips' }, ...keyChips(k)))),
      h('div', { class: 'facts' },
        tile(null, 'Last used', k.isThis ? 'Right now' : fmtDate(k.lastActive)),
        tile(null, 'Where from', k.ip || '—')),
      h('div', { class: 'ids' }, h('div', {}, h('dt', {}, 'Key address'), h('dd', { title: k.address }, shortAddress(k.address)), copyButton(k.address))),
      h('div', { class: 'section-title' }, 'What this key may do'),
      toggle({ label: 'Manage keys', hint: 'Cut new keys, change what keys may do, and take keys back.', checked: draft.manage, disabled: !editable || (lastManager && draft.manage && k.canManage), onChange: (v) => { draft.manage = v; app.refreshSheet(true); } }),
      toggle({ label: 'Send gold', hint: 'Send gold to other owners and move it in and out of the group bank.', checked: draft.send, disabled: !editable, onChange: (v) => { draft.send = v; app.refreshSheet(true); } }),
    ];
    if (k.isPrimary) body.push(h('div', { class: 'note' }, 'This is your main key. It belongs to your recovery phrase, so it can always do everything and can’t be taken back.'));
    else if (!me.canManage) body.push(h('div', { class: 'note' }, 'This browser’s key can’t change other keys. Use a key that manages keys.'));
    else if (lastManager) body.push(h('div', { class: 'note warn' }, 'This is the only key that can manage keys. Keep it that way, or you’ll need your recovery phrase to manage keys again.'));
    const foot = [];
    if (editable && changed) {
      foot.push(h('button', { class: 'btn small', onclick: () => app.act(async () => { await app.svc.setKeyPermissions(k.address, draft); app.drafts.key = null; await app.reloadPage(); }) }, icon('check'), 'Save changes'));
      foot.push(h('button', { class: 'btn small ghost', onclick: () => { app.drafts.key = null; app.refreshSheet(true); } }, 'Undo'));
    }
    if (k.isThis) foot.push(h('button', { class: 'btn small ghost', onclick: () => (app.svc.mode === 'live' ? app.signOutFlow() : app.leaveDemo()) }, icon('out'), app.svc.mode === 'live' ? 'Sign out here' : 'Back to title'));
    else if (me.canManage && !k.isPrimary) {
      foot.push(h('button', { class: 'btn small berry', onclick: () => app.confirm('Take back this key?', `${k.label} will be signed out right away and will need a new key (or your recovery phrase) to get back in.${k.gold ? ` ${gold(k.gold)} gold sitting on that key stays there.` : ''}`, 'Take it back',
        () => app.act(async () => { await app.svc.takeBackKey(k.address); app.pageBack(); })) }, icon('out'), 'Take back this key'));
    }
    return { body, foot };
  },
};

/**
 * Cutting a key: get a code, wait for the new device to ask, then approve it
 * with the permissions you choose. State lives on app.keyCut so it survives
 * re-renders; leaving the page cancels the wait.
 */
const cut = {
  title: 'Cut a new key',
  render(app) {
    const c = app.keyCut ??= { phase: 'start', perms: { manage: false, send: false } };
    if (c.phase === 'start') startCut(app);
    const group = app.svc.state.me.guildName || 'your group';
    if (c.phase === 'start' || c.phase === 'making') return { body: [loading('Cutting a key…')] };
    if (c.phase === 'error') {
      return { body: [h('div', { class: 'note warn' }, c.error)], foot: [h('button', { class: 'btn small', onclick: () => { app.keyCut = null; app.refreshSheet(true); } }, 'Try again')] };
    }
    if (c.phase === 'waiting') {
      return {
        body: [
          h('div', { class: 'key-code' }, h('small', {}, 'Key code'), h('b', { 'aria-live': 'polite' }, c.code), copyButton(c.code)),
          h('ol', { class: 'steps' },
            h('li', {}, 'On the other device, open À la Structs and choose ', h('b', {}, 'Continue'), '.'),
            h('li', {}, 'Choose ', h('b', {}, 'Use a key code'), ` and pick ${group}.`),
            h('li', {}, 'Type this code. The request pops up here.')),
          loading('Waiting for the other device…'),
        ],
        foot: [h('button', { class: 'btn small ghost', onclick: () => { cut.leave(app); app.keyCut = null; app.refreshSheet(true); } }, 'New code'),
          h('button', { class: 'btn small ghost', onclick: () => app.pageBack() }, 'Cancel')],
      };
    }
    if (c.phase === 'request') {
      const r = c.request;
      return {
        body: [
          h('div', { class: 'note' }, h('b', {}, 'A device is asking for a key. '), 'Only approve it if it’s yours — a key opens your whole restaurant.'),
          h('div', { class: 'hero' }, keyFob(r.address, 'big'), h('div', {}, h('h3', {}, r.label), h('div', { class: 'sub' }, r.ip ? `From ${r.ip}` : 'Asking just now'), h('div', { class: 'sub' }, `Code ${c.code}`))),
          h('div', { class: 'section-title' }, 'What the new key may do'),
          h('div', { class: 'note' }, 'It can always run the restaurant: hire, serve, take on challenges.'),
          toggle({ label: 'Manage keys', hint: 'Cut new keys and take keys back.', checked: c.perms.manage, onChange: (v) => { c.perms.manage = v; } }),
          toggle({ label: 'Send gold', hint: 'Send gold and use the group bank.', checked: c.perms.send, onChange: (v) => { c.perms.send = v; } }),
        ],
        foot: [
          h('button', { class: 'btn small', onclick: async () => {
            c.phase = 'approving'; app.refreshSheet(true);
            try { await app.svc.approveKey(r, c.perms); c.phase = 'done'; } catch (e) { c.phase = 'error'; c.error = app.svc.friendlyError(e); }
            if (app.keyCut === c) app.refreshSheet(true);
          } }, icon('check'), 'Hand over the key'),
          h('button', { class: 'btn small berry', onclick: () => { app.svc.refuseKey(r); app.keyCut = null; app.pageBack(); app.announce({ text: 'Request refused. That code no longer works.', tone: 'info' }); } }, 'Refuse'),
        ],
      };
    }
    if (c.phase === 'approving') return { body: [loading('Handing over the key…')] };
    return {
      body: [h('div', { class: 'done-note' }, icon('check', 'big-icon'), h('h3', {}, 'Key handed over'), h('p', {}, 'The other device is signing in now. You’ll find it on your key ring.'))],
      foot: [h('button', { class: 'btn small', onclick: () => { app.keyCut = null; app.pageBack(); } }, 'Back to the key ring')],
    };
  },
  leave(app) {
    const c = app.keyCut;
    if (c?.wait) c.wait.cancel?.();
    if (c && c.phase !== 'approving') app.keyCut = null;
  },
};

async function startCut(app) {
  const c = app.keyCut;
  c.phase = 'making';
  try {
    const { code, request } = await app.svc.cutKey();
    if (app.keyCut !== c) { request.cancel?.(); return; }
    c.code = code; c.wait = request; c.phase = 'waiting';
    app.refreshSheet(true);
    request.then((r) => { if (app.keyCut !== c) return; c.request = r; c.phase = 'request'; app.sfxPing(); app.refreshSheet(true); },
      (e) => { if (app.keyCut !== c || /cancel/.test(e?.message)) return; c.phase = 'error'; c.error = app.svc.friendlyError(e); app.refreshSheet(true); });
  } catch (e) {
    if (app.keyCut !== c) return;
    c.phase = 'error'; c.error = app.svc.friendlyError(e);
    app.refreshSheet(true);
  }
}

/* ── sending gold ───────────────────────────────────────────────────────── */

function stepsBar(at) {
  const names = ['How much', 'To whom', 'Check'];
  return h('ol', { class: 'stepsbar' }, ...names.map((n, i) => h('li', { class: i === at ? 'on' : i < at ? 'done' : '' }, h('span', {}, String(i + 1)), n)));
}

function recipientRow(app, r, onclick) {
  return h(onclick ? 'button' : 'div', { class: `card ${onclick ? 'card-btn' : ''}`, onclick },
    h('img', { class: 'portrait', src: ownerFace(app, r.id, r.species), alt: '' }),
    h('div', {}, h('h3', {}, r.name), h('div', { class: 'sub' }, [r.restaurantName, r.guildTag ? `[${r.guildTag}] ${r.guildName}` : r.guildName].filter(Boolean).join(' · ') || `Owner #${r.id}`)));
}

const send = {
  title: 'Send gold',
  render(app, _d, params) {
    const st = app.svc.state;
    const d = app.sendDraft ??= { step: 0, amount: Math.min(5, st.wallet.gold), query: '', results: null, recipient: params.to || null, groupOnly: false };
    if (st.wallet.gold <= 0 && d.step < 2) return { body: [h('div', { class: 'note' }, 'Your wallet is empty. Your Sous Chef turns recipes into gold — come back once they’ve sold a few dishes.')] };
    const go = (step) => { d.step = step; app.refreshSheet(true); };
    if (d.step === 0) {
      return {
        body: [stepsBar(0), d.recipient ? recipientRow(app, d.recipient) : null,
          h('div', { class: 'field' }, h('label', { for: 'send-amount' }, `How much gold? You have ${gold(st.wallet.gold)}.`),
            stepper({ id: 'send-amount', value: d.amount, min: 1, max: st.wallet.gold, label: 'Gold to send', onChange: (v) => { d.amount = v; },
              quick: [['1', 1], ['5', 5], ['10', 10], ['Half', Math.floor(st.wallet.gold / 2)], ['All', st.wallet.gold]] }))],
        foot: [h('button', { class: 'btn small', onclick: () => go(d.recipient ? 2 : 1) }, 'Next', icon('next'))],
      };
    }
    if (d.step === 1) {
      const q = h('input', { type: 'search', id: 'recipient-search', placeholder: 'Name, owner no. or address', value: d.query, autocomplete: 'off' });
      const search = async () => {
        d.query = q.value; d.results = 'loading'; app.refreshSheet(true);
        try { d.results = await app.svc.findRecipients(d.query, d.groupOnly ? st.me.guildId : null); } catch (e) { d.results = []; app.announce({ text: app.svc.friendlyError(e), tone: 'bad' }); }
        if (app.sendDraft === d) app.refreshSheet(true);
      };
      if (d.results === null) search();
      return {
        body: [stepsBar(1),
          h('form', { class: 'field', onsubmit: (e) => { e.preventDefault(); search(); } }, h('label', { for: 'recipient-search' }, 'Who gets it?'),
            h('div', { class: 'inline' }, q, h('button', { class: 'btn small sea', type: 'submit' }, icon('search'), 'Find'))),
          h('label', { class: 'chip-btn', style: { justifySelf: 'start' } }, h('input', { type: 'checkbox', checked: d.groupOnly, onchange: (e) => { d.groupOnly = e.target.checked; search(); } }), `Only ${st.me.guildName || 'my group'}`),
          d.results === 'loading' || d.results === null ? loading('Looking around town…')
            : !d.results.length ? h('p', {}, 'Nobody matches that.')
              : d.results.map((r) => recipientRow(app, r, () => { d.recipient = r; go(2); }))],
        foot: [h('button', { class: 'btn small ghost', onclick: () => go(0) }, icon('back'), 'Back')],
      };
    }
    // d.step 2: check and send
    const r = d.recipient;
    return {
      body: [stepsBar(2),
        h('div', { class: 'receipt' },
          h('div', { class: 'receipt-row' }, h('span', {}, 'From'), h('b', {}, `${st.me.name} (you)`)),
          h('div', { class: 'receipt-row' }, h('span', {}, 'To'), h('b', {}, r.name)),
          r.restaurantName ? h('div', { class: 'receipt-row' }, h('span', {}, 'Restaurant'), h('b', {}, r.restaurantName)) : null,
          r.address ? h('div', { class: 'receipt-row' }, h('span', {}, 'Address'), h('b', { title: r.address }, shortAddress(r.address))) : null,
          h('div', { class: 'receipt-row total' }, h('span', {}, 'Gold'), h('b', {}, icon('gold'), gold(d.amount))),
          h('div', { class: 'receipt-row' }, h('span', {}, 'Left in your wallet'), h('b', {}, gold(st.wallet.gold - d.amount)))),
        h('div', { class: 'note warn' }, 'Gold you send can’t be taken back.')],
      foot: [
        h('button', { class: 'btn small butter', disabled: d.sending, onclick: async (e) => {
          d.sending = true; e.currentTarget.disabled = true; e.currentTarget.lastChild.textContent = 'Sending…';
          try { await app.svc.sendGold(r, d.amount); app.sendDraft = null; app.openPage('office', 'ledger', { page: 1 }, { push: false }); }
          catch (x) { d.sending = false; app.announce({ text: app.svc.friendlyError(x), tone: 'bad' }); app.refreshSheet(true); }
        } }, icon('send'), h('span', {}, `Send ${gold(d.amount)} gold`)),
        h('button', { class: 'btn small ghost', onclick: () => go(0) }, 'Change amount'),
        params.to ? null : h('button', { class: 'btn small ghost', onclick: () => go(1) }, 'Change who'),
      ],
    };
  },
  leave(app) { app.sendDraft = null; },
};

/* ── ledger ─────────────────────────────────────────────────────────────── */

function ledgerLine(t) {
  const who = t.counterpartyName || (t.counterparty ? shortAddress(t.counterparty) : null);
  const what = { sent: 'Sent', received: 'Received', infused: 'Deposited at the bank', defused: 'Withdrawn from the bank', refined: 'Sold a perfected dish', seized: 'Taken in a challenge', forfeited: 'Lost in a challenge' }[t.kind] || (t.out ? 'Paid out' : 'Came in');
  return who && (t.kind === 'sent' || t.kind === 'received' || !t.kind) ? `${what} ${t.out ? 'to' : 'from'} ${who}` : what;
}

const ledger = {
  title: 'Ledger',
  load: (app, { page = 1 }) => app.svc.ledger(page),
  render(app, d, params) {
    const page = params.page || 1;
    const body = [h('p', {}, `${plural(d.total, 'entry', 'entries')} of gold in and out of your wallet.`)];
    if (!d.items.length) body.push(h('div', { class: 'note' }, 'No gold has moved yet.'));
    for (const t of d.items) {
      body.push(h('button', { class: 'ledger-row', onclick: () => app.openPage('office', 'entry', { id: t.id }) },
        h('span', { class: `dir ${t.out ? 'out' : 'in'}`, 'aria-hidden': 'true' }, t.out ? '−' : '+'),
        h('span', { class: 'what' }, h('b', {}, ledgerLine(t)), h('small', {}, `${fmtDate(t.time)}${t.tick ? ` · tick ${t.tick.toLocaleString('en-US')}` : ''}`)),
        h('span', { class: `amt ${t.out ? 'out' : 'in'}` }, `${t.out ? '−' : '+'}${gold(t.amount)}`)));
    }
    body.push(pager(page, d.pages, (p) => app.openPage('office', 'ledger', { page: p }, { push: false })));
    return { body, foot: [h('button', { class: 'btn small butter', onclick: () => app.openPage('office', 'send') }, icon('send'), 'Send gold')] };
  },
};

const entry = {
  title: (app, t) => (t ? `Receipt #${t.id}` : 'Receipt'),
  load: (app, { id }) => app.svc.ledgerEntry(id),
  render(app, t) {
    if (!t) return { body: [h('div', { class: 'note' }, 'That entry isn’t in the ledger anymore.')] };
    return {
      body: [h('div', { class: 'receipt' },
        h('div', { class: 'receipt-head' }, icon('ledger'), h('b', {}, ledgerLine(t))),
        h('div', { class: 'receipt-row' }, h('span', {}, 'When'), h('b', {}, t.time ? t.time.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—')),
        t.tick ? h('div', { class: 'receipt-row' }, h('span', {}, 'Tick'), h('b', {}, t.tick.toLocaleString('en-US'))) : null,
        t.counterpartyName ? h('div', { class: 'receipt-row' }, h('span', {}, t.out ? 'To' : 'From'), h('b', {}, t.counterpartyName)) : null,
        t.counterparty ? h('div', { class: 'receipt-row' }, h('span', {}, 'Address'), h('b', { title: t.counterparty }, shortAddress(t.counterparty))) : null,
        h('div', { class: 'receipt-row total' }, h('span', {}, 'Gold'), h('b', { class: t.out ? 'out' : 'in' }, `${t.out ? '−' : '+'}${gold(t.amount)}`)),
        h('div', { class: 'receipt-row' }, h('span', {}, 'Receipt no.'), h('b', {}, `#${t.id}`)))],
      foot: [
        t.counterpartyId ? h('button', { class: 'btn small ghost', onclick: () => app.openPage('office', 'profile', { id: t.counterpartyId }) }, 'View owner') : null,
        t.counterparty ? copyButton(t.counterparty, 'Copy address', 'btn small ghost') : null,
      ],
    };
  },
};

export const OFFICE = { index, profile, rename, keys, key, cut, send, ledger, entry };
