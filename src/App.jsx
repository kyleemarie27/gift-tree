import React, { useCallback, useEffect, useState } from 'react';
import { supabase, configured, isDemo } from './supabase.js';
import Tree from './Tree.jsx';

/* ───────────────────────── helpers ───────────────────────── */

function useHashRoute() {
  const get = () => (window.location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => { setRoute(get()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
const go = (path) => { window.location.hash = '/' + path; };
const first = (name = '') => name.trim().split(/\s+/)[0] || 'Someone';
const possessive = (n) => (n.endsWith('s') ? `${n}'` : `${n}'s`);
const initials = (name = '?') => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const COLORS = ['#c8423b', '#3f8f5f', '#e5a93b', '#6b8fd6', '#d870a0', '#8f63c9', '#2f6f8f', '#b86b3b'];
const colorFor = (id = '') => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

function Avatar({ p, size = 40 }) {
  return (
    <span className="avatar" style={{ background: colorFor(p?.id), width: size, height: size, fontSize: size * 0.4 }}>
      {initials(p?.name)}
    </span>
  );
}

function Toast({ msg }) {
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

/* ───────────────────────── root ───────────────────────── */

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <div className="center-page">
        <div className="card narrow">
          <h1 className="display">Gift Tree 🎄</h1>
          <p>Almost ready! Add your Supabase URL and anon key to <code>src/config.js</code>.</p>
        </div>
      </div>
    );
  }
  if (session === undefined) return <div className="center-page"><div className="loader">🎁</div></div>;
  if (!session) return <Login />;
  return <Main session={session} />;
}

/* ───────────────────────── login ───────────────────────── */

function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');

  async function send(e) {
    e.preventDefault();
    setState('sending'); setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) { setErr(error.message); setState('idle'); } else setState('sent');
  }

  return (
    <div className="center-page snow">
      <div className="card narrow login">
        <div className="login-tree"><Tree count={5} /></div>
        <h1 className="display">Gift Tree</h1>
        <p className="muted">Our family Christmas lists, minus the spoilers.</p>
        {state === 'sent' ? (
          <div className="sent">
            <div className="big-emoji">📬</div>
            <p><strong>Check your email!</strong><br />We sent a magic link to <strong>{email}</strong>. Tap it on this device to sign in.</p>
            <button className="link" onClick={() => setState('idle')}>Use a different email</button>
          </div>
        ) : (
          <form onSubmit={send} className="stack">
            <label className="field">
              <span>Your email</span>
              <input type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn primary big" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send me a magic link ✨'}
            </button>
            {err && <p className="error">{err}</p>}
            <p className="tiny muted">No password needed. First time? This creates your account.</p>
          </form>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── main shell ───────────────────────── */

function Main({ session }) {
  const uid = session.user.id;
  const route = useHashRoute();
  const [d, setD] = useState(null);
  const [toast, setToast] = useState('');
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2400); };

  const load = useCallback(async () => {
    const [profiles, items, claims, events, members, matches, count] = await Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase.from('items').select('*').order('created_at'),
      supabase.from('claims').select('*'),
      supabase.from('santa_events').select('*').order('created_at', { ascending: false }),
      supabase.from('santa_members').select('*'),
      supabase.from('santa_matches').select('*'),
      supabase.rpc('my_gift_count'),
    ]);
    const santaStatus = {};
    await Promise.all((events.data || []).map(async (ev) => {
      const { data } = await supabase.rpc('santa_status', { ev: ev.id });
      santaStatus[ev.id] = data || [];
    }));
    setD({
      santaStatus,
      profiles: profiles.data || [], items: items.data || [], claims: claims.data || [],
      events: events.data || [], members: members.data || [], matches: matches.data || [],
      giftCount: count.data || 0,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live-ish updates: refresh when the tab regains focus.
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [load]);

  if (!d) return <div className="center-page"><div className="loader">🎁</div></div>;

  const byId = Object.fromEntries(d.profiles.map((p) => [p.id, p]));
  const me = byId[uid] || { id: uid, name: '' };
  const ctx = { uid, me, byId, d, load, flash };

  if (!me.name) {
    return (
      <div className="page">
        <div className="card">
          <h1 className="display">Welcome! 🎄</h1>
          <p className="muted">Let's set up your profile so everyone knows what to get you.</p>
          <ProfileForm ctx={ctx} onDone={() => go('home')} firstTime />
        </div>
        <Toast msg={toast} />
      </div>
    );
  }

  const [page, arg] = route;
  let body;
  if (page === 'person' && byId[arg] && arg !== uid) body = <PersonPage ctx={ctx} person={byId[arg]} />;
  else if (page === 'family') body = <Family ctx={ctx} />;
  else if (page === 'shopping') body = <MyShoppingPage ctx={ctx} />;
  else if (page === 'santa' && arg === 'new') body = <SantaCreate ctx={ctx} />;
  else if (page === 'santa' && arg && d.events.find((e) => e.id === arg)) body = <SantaGroup ctx={ctx} ev={d.events.find((e) => e.id === arg)} />;
  else if (page === 'santa') body = <SantaHome ctx={ctx} />;
  else if (page === 'me') body = <MePage ctx={ctx} />;
  else body = <MyList ctx={ctx} />;

  const tab = page === 'person' || page === 'shopping' ? 'family' : ['family', 'santa', 'me'].includes(page) ? page : 'home';
  return (
    <>
      {isDemo && <div className="demo-banner">👀 Demo mode with pretend family. Nothing is saved. <a href="/">Exit</a></div>}
      <header className="topbar">
        <a href="#/home" className="brand">🎄 Gift Tree</a>
        <a href="#/me" className="me-link" aria-label="My profile"><Avatar p={me} size={34} /></a>
      </header>
      <main className="page">{body}</main>
      <nav className="tabs">
        <a href="#/home" className={tab === 'home' ? 'on' : ''}><span>🎁</span>My list</a>
        <a href="#/family" className={tab === 'family' ? 'on' : ''}><span>👨‍👩‍👧‍👦</span>Family</a>
        <a href="#/santa" className={tab === 'santa' ? 'on' : ''}><span>🎅</span>Secret Santa</a>
        <a href="#/me" className={tab === 'me' ? 'on' : ''}><span>🧣</span>Me</a>
      </nav>
      <Toast msg={toast} />
    </>
  );
}

/* ───────────────────────── my list ───────────────────────── */

function MyList({ ctx }) {
  const { uid, me, d, load, flash } = ctx;
  const mine = d.items.filter((i) => i.owner_id === uid);
  const [adding, setAdding] = useState(mine.length === 0);
  const [editing, setEditing] = useState(null);
  const [peek, setPeek] = useState(null);

  async function doPeek() {
    if (peek) { setPeek(null); return; }
    if (!confirm('Spoiler alert! 🙈\n\nThis shows which of your items people have already bought. Are you sure you want to peek?')) return;
    const { data } = await supabase.rpc('peek_my_claims');
    setPeek(new Set((data || []).map((r) => r.item_id)));
  }

  async function remove(item) {
    if (!confirm(`Remove "${item.title}" from your list?`)) return;
    await supabase.from('items').delete().eq('id', item.id);
    flash('Removed'); load();
  }

  return (
    <>
      <SantaBanner ctx={ctx} />
      <section className="hero card">
        <h1 className="display">Hi {first(me.name)}! 👋</h1>
        <Tree count={d.giftCount} name={first(me.name)} />
        <p className="tiny muted center">Every present is someone who's shopping for you. No peeking at what! 🤫</p>
      </section>

      <section className="card">
        <div className="row between">
          <h2>My wishlist</h2>
          {!adding && <button className="btn primary" onClick={() => { setAdding(true); setEditing(null); }}>+ Add a gift</button>}
        </div>
        {adding && (
          <ItemForm uid={uid} onCancel={mine.length ? () => setAdding(false) : null}
            onSaved={() => { setAdding(false); load(); flash('Added to your list 🎁'); }} />
        )}
        {mine.length === 0 && !adding && <p className="muted">Your list is empty — add a few ideas!</p>}
        <ul className="items">
          {mine.map((item) => (
            <li key={item.id} className="item">
              {editing === item.id ? (
                <ItemForm uid={uid} item={item} onCancel={() => setEditing(null)}
                  onSaved={() => { setEditing(null); load(); flash('Saved'); }} />
              ) : (
                <>
                  <ItemBody item={item} />
                  <div className="item-actions">
                    {peek && (peek.has(item.id)
                      ? <span className="pill claimed">Bought ✓</span>
                      : <span className="pill">Not yet</span>)}
                    <button className="btn ghost sm" onClick={() => { setEditing(item.id); setAdding(false); }}>Edit</button>
                    <button className="btn ghost sm" onClick={() => remove(item)} aria-label="Remove">🗑</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="tiny muted center">
          You won't see what's been bought — add as much as you like!{' '}
          {mine.length > 0 && <button className="link" onClick={doPeek}>{peek ? 'Hide spoilers' : 'Peek 🙈'}</button>}
        </p>
      </section>
    </>
  );
}

const SWATCHES = [
  ['Black', '#1f1f1f'], ['White', '#ffffff'], ['Ivory', '#f3ecd8'], ['Beige', '#d9c4a3'], ['Brown', '#7a5236'],
  ['Grey', '#9a9a9a'], ['Navy', '#1f2f57'], ['Blue', '#5b86d6'], ['Sage', '#9caf88'], ['Green', '#2f7d4f'],
  ['Red', '#c0392b'], ['Burgundy', '#7a1f2b'], ['Pink', '#f0a8c0'], ['Lavender', '#b9a3dc'], ['Yellow', '#f2cf4a'],
  ['Orange', '#e8843a'], ['Gold', '#d4af37'], ['Silver', '#c0c4c8'],
];

function Swatches({ colors, size = 18 }) {
  if (!colors || !colors.length) return null;
  return (
    <span className="swatches" title={colors.map((c) => c.name).join(', ')}>
      {colors.map((c) => <span key={c.hex + c.name} className="swatch" style={{ background: c.hex, width: size, height: size }} />)}
      <span className="swatch-names">{colors.map((c) => c.name).join(' or ')}</span>
    </span>
  );
}

function ItemBody({ item }) {
  const [broken, setBroken] = useState(false);
  const tint = item.colors?.[0]?.hex;
  return (
    <div className="item-body">
      {item.image_url && !broken ? (
        <a href={item.url || item.image_url} target="_blank" rel="noreferrer" className="thumb-link">
          <img src={item.image_url} alt="" className="thumb" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        </a>
      ) : (
        <div className="thumb placeholder" style={tint ? { background: `linear-gradient(135deg, ${tint}, ${tint}cc)` } : null}>
          <span>🎁</span>
        </div>
      )}
      <div className="item-text">
        <div className="item-title">
          {item.favorite && <span title="Really want this" className="heart">❤️</span>}
          {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}
        </div>
        <div className="item-meta">
          {item.price && <span className="price">{item.price}</span>}
          {item.details && <span>{item.details}</span>}
          {item.url && <span className="site">{safeHost(item.url)}</span>}
        </div>
        <Swatches colors={item.colors} />
        {item.notes && <div className="item-notes">{item.notes}</div>}
      </div>
    </div>
  );
}
function safeHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

// Shrink phone photos before upload (keeps storage small and pages fast).
async function shrink(file, max = 1000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

function ColorPicker({ value, onChange }) {
  const [custom, setCustom] = useState('#9caf88');
  const [customName, setCustomName] = useState('');
  const has = (hex) => value.some((c) => c.hex === hex);
  const toggle = (name, hex) => onChange(has(hex) ? value.filter((c) => c.hex !== hex) : [...value, { name, hex }]);
  return (
    <div className="field">
      <span>Preferred colors <em>(tap any that work, or skip)</em></span>
      <div className="palette">
        {SWATCHES.map(([name, hex]) => (
          <button type="button" key={hex} className={'pick' + (has(hex) ? ' on' : '')} onClick={() => toggle(name, hex)}
            aria-pressed={has(hex)} aria-label={name} title={name}>
            <span className="swatch" style={{ background: hex }} />
            <span className="pick-name">{name}</span>
          </button>
        ))}
      </div>
      <div className="custom-color">
        <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom color" />
        <input placeholder="Name it (e.g. Dusty rose)" value={customName} onChange={(e) => setCustomName(e.target.value)} />
        <button type="button" className="btn sm" onClick={() => { if (!has(custom)) onChange([...value, { name: customName.trim() || 'Custom', hex: custom }]); setCustomName(''); }}>Add</button>
      </div>
      {value.length > 0 && (
        <div className="chosen">
          {value.map((c) => (
            <span key={c.hex} className="chip on static"><span className="swatch" style={{ background: c.hex }} />{c.name}
              <button type="button" className="x" onClick={() => onChange(value.filter((x) => x.hex !== c.hex))} aria-label={`Remove ${c.name}`}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemForm({ item, uid, onSaved, onCancel }) {
  const [f, setF] = useState({
    url: item?.url || '', title: item?.title || '', price: item?.price || '', details: item?.details || '',
    notes: item?.notes || '', image_url: item?.image_url || '', favorite: item?.favorite || false, colors: item?.colors || [],
  });
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showImgUrl, setShowImgUrl] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function fetchPreview(url) {
    if (!/^https?:\/\//i.test(url)) return;
    setFetching(true);
    try {
      const r = await fetch('/api/preview?url=' + encodeURIComponent(url));
      const p = await r.json();
      setF((s) => ({ ...s, title: s.title || p.title || '', price: s.price || p.price || '', image_url: s.image_url || p.image || '' }));
    } catch { /* fine — fill it in by hand */ }
    setFetching(false);
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const blob = await shrink(file);
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await supabase.storage.from('gift-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { data } = supabase.storage.from('gift-photos').getPublicUrl(path);
      setF((s) => ({ ...s, image_url: data.publicUrl }));
    } catch (err) { alert('Could not upload that photo: ' + (err.message || err)); }
    setUploading(false);
  }

  async function save(e) {
    e.preventDefault();
    if (!f.title.trim()) return;
    setSaving(true);
    const row = { ...f, title: f.title.trim(), url: f.url.trim() };
    const { error } = item
      ? await supabase.from('items').update(row).eq('id', item.id)
      : await supabase.from('items').insert(row);
    setSaving(false);
    if (error) alert(error.message); else onSaved();
  }

  return (
    <form className="item-form stack" onSubmit={save}>
      <label className="field">
        <span>Link <em>(paste one and we'll grab the photo &amp; price)</em></span>
        <input type="url" inputMode="url" placeholder="https://…" value={f.url}
          onChange={set('url')}
          onPaste={(e) => { const v = e.clipboardData.getData('text'); setTimeout(() => fetchPreview(v.trim()), 0); }}
          onBlur={() => (!f.title || !f.image_url) && fetchPreview(f.url.trim())} />
      </label>
      {fetching && <p className="tiny muted">Looking that up… ✨</p>}

      <div className="photo-row">
        <div className="photo-box">
          {f.image_url
            ? <img src={f.image_url} alt="" referrerPolicy="no-referrer" onError={() => setF((s) => ({ ...s, image_url: '' }))} />
            : <span className="photo-empty">{uploading ? '⏳' : '📷'}</span>}
        </div>
        <div className="photo-actions">
          <label className="btn sm">
            {uploading ? 'Uploading…' : f.image_url ? 'Change photo' : 'Upload a photo'}
            <input type="file" accept="image/*" hidden onChange={upload} disabled={uploading} />
          </label>
          {!showImgUrl && <button type="button" className="link tiny" onClick={() => setShowImgUrl(true)}>or paste an image link</button>}
          {showImgUrl && <input className="sm-wide" placeholder="https://…/photo.jpg" value={f.image_url} onChange={set('image_url')} />}
          {f.image_url && <button type="button" className="link tiny" onClick={() => setF((s) => ({ ...s, image_url: '' }))}>remove photo</button>}
          <span className="tiny muted">A screenshot works great!</span>
        </div>
      </div>

      <label className="field">
        <span>What is it?</span>
        <input required placeholder="e.g. Big cozy scarf, or “a surprise!”" value={f.title} onChange={set('title')} />
      </label>
      <div className="two">
        <label className="field"><span>Price</span><input placeholder="$80" value={f.price} onChange={set('price')} /></label>
        <label className="field"><span>Size / model</span><input placeholder="M, 11th gen…" value={f.details} onChange={set('details')} /></label>
      </div>
      <ColorPicker value={f.colors} onChange={(colors) => setF((s) => ({ ...s, colors }))} />
      <label className="field">
        <span>Notes</span>
        <input placeholder="Any brand is fine, the bigger one, etc." value={f.notes} onChange={set('notes')} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.favorite} onChange={set('favorite')} /> ❤️ I really, really want this one
      </label>
      <div className="row gap">
        <button className="btn primary" disabled={saving || uploading}>{saving ? 'Saving…' : item ? 'Save' : 'Add to my list'}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

/* ───────────────────────── family ───────────────────────── */

// "$1,200" / "~$80" / "80" → 1200 / 80 / 80. Ranges like "$50-80" use the first number.
function parsePrice(s) {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
const money = (n) => '$' + Math.round(n).toLocaleString();

// What one of MY claims costs me: what I entered, else the list price (split evenly if chipping in).
function claimCost(c, d) {
  if (c.amount != null) return { value: Number(c.amount), estimated: false };
  const item = c.item_id && d.items.find((i) => i.id === c.item_id);
  const price = item ? parsePrice(item.price) : null;
  if (price == null) return { value: 0, estimated: true, unknown: true };
  if (c.kind === 'split') {
    const people = d.claims.filter((x) => x.item_id === c.item_id).length || 1;
    return { value: price / people, estimated: true };
  }
  return { value: price, estimated: false };
}

function shoppingStats(ctx) {
  const { uid, d } = ctx;
  const mine = d.claims.filter((c) => c.claimer_id === uid);
  const per = {};
  let total = 0, unknown = 0;
  for (const c of mine) {
    const cost = claimCost(c, d);
    total += cost.value;
    if (cost.unknown) unknown++;
    const p = (per[c.recipient_id] ||= { count: 0, total: 0, claims: [] });
    p.count++; p.total += cost.value; p.claims.push({ ...c, cost });
  }
  return { mine, per, total, unknown };
}

function useBudget(uid) {
  const key = 'gift-tree-budget-' + uid;
  const [budget, setBudgetState] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const setBudget = (v) => { setBudgetState(v); try { localStorage.setItem(key, v); } catch { /* private mode */ } };
  return [budget, setBudget];
}

function BudgetSummary({ ctx, full }) {
  const { uid } = ctx;
  const { mine, per, total, unknown } = shoppingStats(ctx);
  const [budget, setBudget] = useBudget(uid);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(budget);
  const b = parsePrice(budget);
  const pct = b ? Math.min(100, (total / b) * 100) : 0;
  const over = b && total > b;
  const people = Object.keys(per).length;

  return (
    <section className="card budget-card">
      <div className="row between">
        <h2>My shopping 🛍️</h2>
        {!full && <a href="#/shopping" className="link tiny">See all</a>}
      </div>
      <div className="stat-row">
        <div className="stat"><span>Spent so far</span><strong>{money(total)}</strong></div>
        <div className="stat"><span>Gifts</span><strong>{mine.length}</strong></div>
        <div className="stat"><span>People</span><strong>{people}</strong></div>
      </div>
      {b ? (
        <>
          <div className={'meter' + (over ? ' over' : '')} role="progressbar" aria-valuemin="0" aria-valuemax={b} aria-valuenow={Math.round(total)}>
            <span style={{ width: pct + '%' }} />
          </div>
          <div className="row between tiny">
            <span className={over ? 'error' : 'muted'}>
              {over ? `${money(total - b)} over budget` : `${money(b - total)} left of ${money(b)}`}
            </span>
            <button className="link tiny" onClick={() => { setDraft(budget); setEditing(true); }}>change budget</button>
          </div>
        </>
      ) : !editing && (
        <button className="link tiny" onClick={() => setEditing(true)}>+ Set a total budget to track your pace</button>
      )}
      {editing && (
        <form className="row gap" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); setBudget(draft); setEditing(false); }}>
          <input className="grow" inputMode="decimal" placeholder="e.g. $1,000" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <button className="btn sm primary">Save</button>
          {budget && <button type="button" className="btn sm ghost" onClick={() => { setBudget(''); setEditing(false); }}>Clear</button>}
        </form>
      )}
      {unknown > 0 && <p className="tiny muted" style={{ marginBottom: 0 }}>{unknown} {unknown === 1 ? 'gift has' : 'gifts have'} no price yet. Add what you paid under “See all.”</p>}
      <p className="tiny muted" style={{ marginBottom: 0 }}>Only you can see this, and your budget stays on this device.</p>
    </section>
  );
}

function Family({ ctx }) {
  const { uid, me, d } = ctx;
  const others = d.profiles.filter((p) => p.id !== uid && p.name);
  others.sort((a, b) => (b.id === me.partner_id) - (a.id === me.partner_id) || a.name.localeCompare(b.name));
  const { per } = shoppingStats(ctx);

  return (
    <>
      <BudgetSummary ctx={ctx} />
      <section className="card">
        <h1 className="display">Family</h1>
        <p className="muted">Tap someone to see their list and claim a gift.</p>
        {others.length === 0 && (
          <div className="empty">
            <p>Nobody else is here yet! Send the family this link:</p>
            <ShareLink />
          </div>
        )}
        <ul className="people">
          {others.map((p) => {
            const items = d.items.filter((i) => i.owner_id === p.id);
            const open = items.filter((i) => !d.claims.some((c) => c.item_id === i.id && c.kind === 'full')).length;
            const mineFor = per[p.id];
            return (
              <li key={p.id}>
                <a href={`#/person/${p.id}`} className="person">
                  <Avatar p={p} size={48} />
                  <div className="grow">
                    <div className="person-name">{p.name}{p.id === me.partner_id && <span className="pill soft">your partner 💕</span>}</div>
                    <div className="tiny muted">{items.length} {items.length === 1 ? 'idea' : 'ideas'} · {open} still available</div>
                  </div>
                  {mineFor ? (
                    <div className="my-tally">
                      <strong>🎁 {mineFor.count}</strong>
                      <span>{money(mineFor.total)}</span>
                    </div>
                  ) : <span className="my-tally none">—</span>}
                  <span className="chev">›</span>
                </a>
              </li>
            );
          })}
        </ul>
        {others.length > 0 && <p className="tiny muted center">🎁 = gifts you've got for them · $ = what you've spent</p>}
      </section>
      {others.length > 0 && <section className="card"><h2>Invite more family</h2><ShareLink /></section>}
    </>
  );
}

function AmountEditor({ claim, ctx }) {
  const { load, flash } = ctx;
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(claim.amount ?? '');
  async function save(e) {
    e.preventDefault();
    const n = parsePrice(v);
    await supabase.from('claims').update({ amount: v === '' ? null : n }).eq('id', claim.id);
    setEditing(false); flash('Saved'); load();
  }
  if (editing) {
    return (
      <form className="row gap" onSubmit={save}>
        <input className="amount-input" inputMode="decimal" placeholder="$" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        <button className="btn sm primary">Save</button>
      </form>
    );
  }
  return (
    <button className="amount" onClick={() => setEditing(true)} title="Tap to enter what you actually paid">
      {claim.cost.unknown ? <span className="muted">+ add price</span> : <>{claim.cost.estimated ? '~' : ''}{money(claim.cost.value)}</>}
      <span className="pencil">✎</span>
    </button>
  );
}

function MyShoppingPage({ ctx }) {
  const { d, byId } = ctx;
  const { per, total, mine } = shoppingStats(ctx);
  const ids = Object.keys(per).sort((a, b) => per[b].total - per[a].total);
  return (
    <>
      <a href="#/family" className="back">‹ Family</a>
      <BudgetSummary ctx={ctx} full />
      {mine.length === 0 && <section className="card"><p className="muted">You haven't claimed anything yet. Head to Family to start shopping!</p></section>}
      {ids.map((rid) => {
        const p = byId[rid];
        return (
          <section key={rid} className="card">
            <div className="row between">
              <a href={`#/person/${rid}`} className="row gap plain-link"><Avatar p={p} size={36} /><h2 style={{ margin: 0 }}>{p?.name}</h2></a>
              <div className="subtotal">{per[rid].count} · <strong>{money(per[rid].total)}</strong></div>
            </div>
            <ul className="shop-list">
              {per[rid].claims.map((c) => {
                const item = d.items.find((i) => i.id === c.item_id);
                return (
                  <li key={c.id}>
                    <div className="grow">
                      <div className="shop-title">{item ? item.title : c.note || 'Something special'}</div>
                      <div className="tiny muted">
                        {c.kind === 'split' ? '🤝 chipping in' : item ? 'from their list' : 'off-list'}
                        {item?.price && ` · listed ${item.price}`}
                      </div>
                    </div>
                    <AmountEditor claim={c} ctx={ctx} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {mine.length > 0 && (
        <p className="trust">Total: <strong>{money(total)}</strong> across {mine.length} gifts. “~” means an estimate (your share of a chip-in). Tap any amount to enter what you really paid.</p>
      )}
    </>
  );
}

function ShareLink() {
  const url = window.location.origin;
  const [copied, setCopied] = useState(false);
  async function share() {
    const text = "Join our family Christmas list! 🎄 Sign in with your email and add your wishlist:";
    if (navigator.share) { try { await navigator.share({ title: 'Gift Tree', text, url }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="share">
      <code>{url.replace(/^https?:\/\//, '')}</code>
      <button className="btn sm" onClick={share}>{copied ? 'Copied!' : 'Share link'}</button>
    </div>
  );
}

/* ───────────────────────── person page ───────────────────────── */

function PersonPage({ ctx, person }) {
  const { uid, d, byId, load, flash } = ctx;
  const items = d.items.filter((i) => i.owner_id === person.id);
  items.sort((a, b) => b.favorite - a.favorite);
  const offList = d.claims.filter((c) => c.recipient_id === person.id && !c.item_id);
  const [offNote, setOffNote] = useState('');
  const [offPrice, setOffPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const name = first(person.name);
  const sizes = [['Tops', person.tops], ['Bottoms', person.bottoms], ['Shoes', person.shoes]].filter(([, v]) => v);

  async function claim(item, kind) {
    setBusy(true);
    const { error } = await supabase.from('claims').insert({ item_id: item.id, recipient_id: person.id, kind });
    setBusy(false);
    if (error) alert(error.message);
    else { flash(kind === 'full' ? `🎁 Got it! Added under ${possessive(name)} tree` : '🤝 You\'re chipping in!'); load(); }
  }
  async function unclaim(c) {
    if (!confirm('Un-claim this gift so someone else can get it?')) return;
    await supabase.from('claims').delete().eq('id', c.id);
    load();
  }
  async function addOffList(e) {
    e.preventDefault();
    if (!offNote.trim()) return;
    const { error } = await supabase.from('claims').insert({ item_id: null, recipient_id: person.id, kind: 'full', note: offNote.trim(), amount: parsePrice(offPrice) });
    if (error) alert(error.message); else { setOffNote(''); setOffPrice(''); flash('🎁 Noted! Only other shoppers can see this.'); load(); }
  }

  return (
    <>
      <a href="#/family" className="back">‹ Family</a>
      <section className="card profile-card">
        <div className="row gap">
          <Avatar p={person} size={56} />
          <div>
            <h1 className="display sm">{possessive(person.name)} list</h1>
            {person.partner_id && byId[person.partner_id] && <div className="tiny muted">with {byId[person.partner_id].name} 💕</div>}
          </div>
        </div>
        {sizes.length > 0 && (
          <div className="sizes">{sizes.map(([k, v]) => <div key={k} className="size"><span>{k}</span><strong>{v}</strong></div>)}</div>
        )}
        {person.notes && <p className="notes">📝 {person.notes}</p>}
        {(() => { const t = shoppingStats(ctx).per[person.id]; return t ? <a href="#/shopping" className="you-got">🎁 You've got {t.count} {t.count === 1 ? 'gift' : 'gifts'} for {name} · <strong>{money(t.total)}</strong></a> : null; })()}
      </section>

      <section className="card">
        <h2>Wishlist</h2>
        {items.length === 0 && <p className="muted">{name} hasn't added anything yet. Nudge them! 😄</p>}
        <ul className="items">
          {items.map((item) => {
            const cs = d.claims.filter((c) => c.item_id === item.id);
            const full = cs.find((c) => c.kind === 'full');
            const mine = cs.find((c) => c.claimer_id === uid);
            const splitters = cs.filter((c) => c.kind === 'split');
            return (
              <li key={item.id} className={'item' + (full ? ' done' : '')}>
                <ItemBody item={item} />
                <div className="claim-area">
                  {full && !mine && <span className="pill claimed">✓ {first(byId[full.claimer_id]?.name)} got this</span>}
                  {mine && (
                    <span className="pill mine">
                      {mine.kind === 'full' ? '✓ You got this' : '🤝 You\'re chipping in'}
                      <button className="link tiny" onClick={() => unclaim(mine)}>undo</button>
                    </span>
                  )}
                  {splitters.filter((c) => c.claimer_id !== uid).length > 0 && (
                    <span className="tiny muted">🤝 {splitters.filter((c) => c.claimer_id !== uid).map((c) => first(byId[c.claimer_id]?.name)).join(', ')} chipping in</span>
                  )}
                  {!full && !mine && (
                    <div className="row gap">
                      {splitters.length === 0 && <button className="btn primary sm" disabled={busy} onClick={() => claim(item, 'full')}>I've got this 🎁</button>}
                      <button className="btn sm" disabled={busy} onClick={() => claim(item, 'split')}>{splitters.length ? 'Join in 🤝' : 'Chip in 🤝'}</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Off-list gifts</h2>
        <p className="tiny muted">Got {name} something not on the list? Note it here so it shows up under their tree. {name} won't see this.</p>
        {offList.length > 0 && (
          <ul className="plain">
            {offList.map((c) => (
              <li key={c.id} className="row between">
                <span>🎁 {c.note} <span className="tiny muted">— {c.claimer_id === uid ? 'you' : first(byId[c.claimer_id]?.name)}</span></span>
                {c.claimer_id === uid && <button className="link tiny" onClick={() => unclaim(c)}>remove</button>}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addOffList} className="row gap">
          <input className="grow" placeholder="e.g. Cozy socks from Costco" value={offNote} onChange={(e) => setOffNote(e.target.value)} />
          <input className="amount-input" inputMode="decimal" placeholder="$" value={offPrice} onChange={(e) => setOffPrice(e.target.value)} aria-label="What you paid" />
          <button className="btn sm">Add</button>
        </form>
      </section>
    </>
  );
}

/* ───────────────────────── me / profile ───────────────────────── */

function MePage({ ctx }) {
  return (
    <>
      <section className="card">
        <h1 className="display">My profile</h1>
        <ProfileForm ctx={ctx} />
      </section>
      <section className="card">
        <h2>Add Gift Tree to your home screen</h2>
        <p className="tiny muted">iPhone: tap the Share button, then “Add to Home Screen.” Android: tap ⋮, then “Add to Home screen.”</p>
      </section>
      <button className="btn ghost full" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </>
  );
}

function ProfileForm({ ctx, onDone, firstTime }) {
  const { uid, me, d, load, flash } = ctx;
  const [f, setF] = useState({
    name: me.name || '', tops: me.tops || '', bottoms: me.bottoms || '', shoes: me.shoes || '', notes: me.notes || '',
    partner_id: me.partner_id || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const others = d.profiles.filter((p) => p.id !== uid && p.name);

  async function save(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    const { partner_id, ...rest } = f;
    const { error } = await supabase.from('profiles').update({ ...rest, name: rest.name.trim() }).eq('id', uid);
    if (!error && (partner_id || null) !== (me.partner_id || null)) {
      await supabase.rpc('set_partner', { p: partner_id || null });
    }
    setSaving(false);
    if (error) return alert(error.message);
    await load();
    flash('Profile saved ✨');
    onDone && onDone();
  }

  return (
    <form className="stack" onSubmit={save}>
      <label className="field">
        <span>Your name</span>
        <input required placeholder="What the family calls you" value={f.name} onChange={set('name')} />
      </label>
      <label className="field">
        <span>Partner <em>(so Secret Santa never pairs you two)</em></span>
        <select value={f.partner_id} onChange={set('partner_id')}>
          <option value="">— none / not listed yet —</option>
          {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {firstTime && others.length === 0 && <em className="tiny muted">If your partner hasn't joined yet, you can set this later.</em>}
      </label>
      <fieldset className="sizes-edit">
        <legend>Sizes</legend>
        <div className="three">
          <label className="field"><span>Tops</span><input placeholder="S" value={f.tops} onChange={set('tops')} /></label>
          <label className="field"><span>Bottoms</span><input placeholder="M / 8 / 28" value={f.bottoms} onChange={set('bottoms')} /></label>
          <label className="field"><span>Shoes</span><input placeholder="9" value={f.shoes} onChange={set('shoes')} /></label>
        </div>
      </fieldset>
      <label className="field">
        <span>Notes for gift-givers</span>
        <textarea rows="3" placeholder="Favorite colors, ring size, allergies, “please no more mugs”…" value={f.notes} onChange={set('notes')} />
      </label>
      <button className="btn primary big" disabled={saving}>{saving ? 'Saving…' : firstTime ? 'Let’s go! 🎄' : 'Save profile'}</button>
    </form>
  );
}

/* ───────────────────────── secret santa ───────────────────────── */

const fmtWhen = (ts) => ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

function santaInfo(ctx, ev) {
  const { uid, d, byId } = ctx;
  const members = d.members.filter((m) => m.event_id === ev.id).map((m) => byId[m.profile_id]).filter(Boolean);
  const status = d.santaStatus[ev.id] || [];
  const assigned = status.filter((s) => s.assigned).length;
  const seen = status.filter((s) => s.seen).length;
  const myMatch = d.matches.find((m) => m.event_id === ev.id && m.giver_id === uid);
  return { members, status, assigned, seen, myMatch, isIn: members.some((m) => m.id === uid), isOrganizer: ev.created_by === uid };
}

function shareSanta(ev, n) {
  const url = window.location.origin;
  const bits = [ev.budget && `Limit: ${ev.budget}`, ev.exchange_date && `Exchange: ${fmtDate(ev.exchange_date)}`].filter(Boolean).join(' · ');
  const text = ev.drawn_at
    ? `🎅 Names are drawn for ${ev.name}! All ${n} of us have been assigned someone. Open Gift Tree to see who you got (shh 🤫). ${bits}`
    : `🎅 You're in ${ev.name}! Names will be drawn soon. Make sure your Gift Tree list is up to date. ${bits}`;
  if (navigator.share) return navigator.share({ title: ev.name, text, url }).catch(() => {});
  navigator.clipboard?.writeText(text + ' ' + url);
  alert('Message copied! Paste it in the family group chat.');
}

function AvatarStack({ people, size = 30 }) {
  return (
    <span className="avatar-stack">
      {people.slice(0, 6).map((p) => <Avatar key={p.id} p={p} size={size} />)}
      {people.length > 6 && <span className="more">+{people.length - 6}</span>}
    </span>
  );
}

// Home-screen nudge when you've been assigned but haven't looked yet.
function SantaBanner({ ctx }) {
  const { d } = ctx;
  const unseen = d.events.filter((ev) => ev.drawn_at && d.matches.some((m) => m.event_id === ev.id && !m.seen_at));
  if (!unseen.length) return null;
  const ev = unseen[0];
  return (
    <a href={`#/santa/${ev.id}`} className="santa-banner">
      <span className="big-emoji">🎅</span>
      <span><strong>Names are drawn for {ev.name}!</strong><br />Tap to see who you got →</span>
    </a>
  );
}

function SantaHome({ ctx }) {
  const { d } = ctx;
  return (
    <>
      <section className="card">
        <h1 className="display">Secret Santa 🎅</h1>
        <ol className="how">
          <li><span>1</span><div><strong>Start a group</strong><br /><em>Pick who's in, set a spending limit and a date.</em></div></li>
          <li><span>2</span><div><strong>Draw names</strong><br /><em>The app shuffles everyone. Couples never draw each other.</em></div></li>
          <li><span>3</span><div><strong>Everyone opens their match</strong><br /><em>You only ever see who <u>you</u> got. Nobody sees the whole list.</em></div></li>
        </ol>
        <a href="#/santa/new" className="btn primary big">+ Start a Secret Santa</a>
      </section>
      {d.events.map((ev) => {
        const s = santaInfo(ctx, ev);
        return (
          <a key={ev.id} href={`#/santa/${ev.id}`} className="card group-card">
            <div className="row between">
              <h2>{ev.name}</h2>
              <span className="chev">›</span>
            </div>
            <AvatarStack people={s.members} />
            <div className="group-meta">
              {ev.budget && <span>💸 {ev.budget}</span>}
              {ev.exchange_date && <span>📅 {fmtDate(ev.exchange_date)}</span>}
              <span>👥 {s.members.length} people</span>
            </div>
            <div className="group-status">
              {!ev.drawn_at
                ? <span className="pill">⏳ Waiting for names to be drawn</span>
                : <span className="pill claimed">✓ All {s.assigned} assigned · {s.seen} of {s.members.length} opened</span>}
              {s.myMatch && !s.myMatch.seen_at && <span className="pill mine">🎁 Your match is waiting!</span>}
            </div>
          </a>
        );
      })}
    </>
  );
}

function SantaCreate({ ctx }) {
  const { uid, d, byId, load, flash } = ctx;
  const people = d.profiles.filter((p) => p.name);
  const [name, setName] = useState('Sibling Secret Santa');
  const [budget, setBudget] = useState('');
  const [date, setDate] = useState('');
  const [sel, setSel] = useState(new Set([uid]));
  const [saving, setSaving] = useState(false);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = people.filter((p) => sel.has(p.id));
  const couples = chosen.filter((p) => p.partner_id && sel.has(p.partner_id) && p.id < p.partner_id)
    .map((p) => `${first(p.name)} & ${first(byId[p.partner_id].name)}`);

  async function create(e) {
    e.preventDefault();
    if (sel.size < 3) return alert('Pick at least 3 people.');
    setSaving(true);
    const { data: ev, error } = await supabase.from('santa_events').insert({ name: name.trim() || 'Secret Santa', budget, exchange_date: date }).select().single();
    if (error) { setSaving(false); return alert(error.message); }
    await supabase.from('santa_members').insert([...sel].map((profile_id) => ({ event_id: ev.id, profile_id })));
    await load(); setSaving(false); flash('Group created 🎅');
    go('santa/' + ev.id);
  }

  return (
    <>
      <a href="#/santa" className="back">‹ Secret Santa</a>
      <form className="card stack" onSubmit={create}>
        <h1 className="display sm">Start a Secret Santa</h1>
        <label className="field"><span>Group name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="two">
          <label className="field"><span>Spending limit</span><input placeholder="$100" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
          <label className="field"><span>Gift exchange</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className="field">
          <span>Who's in? <em>({sel.size} picked)</em></span>
          <div className="pick-people">
            {people.map((p) => (
              <button type="button" key={p.id} className={'pick-person' + (sel.has(p.id) ? ' on' : '')} onClick={() => toggle(p.id)} aria-pressed={sel.has(p.id)}>
                <Avatar p={p} size={36} />
                <span>{p.name}{p.id === uid && ' (you)'}</span>
                <span className="tick">{sel.has(p.id) ? '✓' : ''}</span>
              </button>
            ))}
          </div>
          <em className="tiny muted">Don't see someone? They need to sign in to Gift Tree once first.</em>
        </div>
        {couples.length > 0 && <p className="note-box">💕 {couples.join(', ')} won't draw each other.</p>}
        <button className="btn primary big" disabled={saving}>{saving ? 'Creating…' : 'Create group'}</button>
        <p className="tiny muted center">You'll be the organizer. Names aren't drawn until you press the button.</p>
      </form>
    </>
  );
}

function Step({ n, done, active, title, children }) {
  return (
    <li className={'step' + (done ? ' done' : '') + (active ? ' active' : '')}>
      <span className="dot">{done ? '✓' : n}</span>
      <div><strong>{title}</strong>{children && <div className="tiny muted">{children}</div>}</div>
    </li>
  );
}

function SantaGroup({ ctx, ev }) {
  const { uid, d, byId, load, flash } = ctx;
  const { members, status, assigned, seen, myMatch, isIn, isOrganizer } = santaInfo(ctx, ev);
  const receiver = myMatch && byId[myMatch.receiver_id];
  const organizer = byId[ev.created_by];
  const [open, setOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState(ev.budget || '');
  const [date, setDate] = useState(ev.exchange_date || '');
  const statusOf = (id) => status.find((s) => s.profile_id === id) || {};
  const notIn = d.profiles.filter((p) => p.name && !members.some((m) => m.id === p.id));
  const allSeen = ev.drawn_at && seen === members.length;

  async function reveal() {
    setOpen(true);
    if (!myMatch.seen_at) { await supabase.rpc('mark_santa_seen', { ev: ev.id }); load(); }
  }
  async function draw() {
    if (!confirm(`Draw names for all ${members.length} people now?\n\nEveryone gets one person. You'll only see who YOU got.`)) return;
    setDrawing(true);
    const { error } = await supabase.rpc('draw_santa', { ev: ev.id });
    await new Promise((r) => setTimeout(r, 1500)); // a little suspense
    setDrawing(false);
    if (error) return alert(error.message);
    await load(); flash(`🎩 Done! All ${members.length} people have a match.`);
  }
  async function redraw() {
    if (!confirm('Start over?\n\nThis throws out everyone\'s match. People who already looked will get a NEW person when you draw again.')) return;
    const { error } = await supabase.rpc('reset_santa', { ev: ev.id });
    if (error) return alert(error.message);
    load();
  }
  async function saveDetails() {
    await supabase.from('santa_events').update({ budget, exchange_date: date }).eq('id', ev.id);
    setEditing(false); load();
  }
  async function add(id) { await supabase.from('santa_members').insert({ event_id: ev.id, profile_id: id }); load(); }
  async function removeM(id) { await supabase.from('santa_members').delete().eq('event_id', ev.id).eq('profile_id', id); load(); }
  async function del() {
    if (!confirm(`Delete "${ev.name}"? This can't be undone.`)) return;
    await supabase.from('santa_events').delete().eq('id', ev.id); await load(); go('santa');
  }

  return (
    <>
      <a href="#/santa" className="back">‹ Secret Santa</a>

      <section className="card">
        <h1 className="display sm">{ev.name}</h1>
        {editing ? (
          <div className="two" style={{ marginTop: 10 }}>
            <label className="field"><span>Spending limit</span><input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="$100" /></label>
            <label className="field"><span>Gift exchange</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <div className="row gap"><button className="btn sm primary" onClick={saveDetails}>Save</button><button className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button></div>
          </div>
        ) : (
          <div className="group-meta big">
            <span>💸 <strong>{ev.budget || 'No limit set'}</strong></span>
            {ev.exchange_date && <span>📅 <strong>{fmtDate(ev.exchange_date)}</strong></span>}
            <span>👤 Organized by {organizer ? first(organizer.name) : '…'}</span>
            {isOrganizer && <button className="link tiny" onClick={() => setEditing(true)}>edit</button>}
          </div>
        )}

        <ol className="steps">
          <Step n={1} done title={`Group set up · ${members.length} people`} />
          <Step n={2} done={!!ev.drawn_at} active={!ev.drawn_at}
            title={ev.drawn_at ? `Names drawn · all ${assigned} assigned` : 'Draw names'}>
            {ev.drawn_at
              ? `Drawn by ${first(byId[ev.drawn_by]?.name || organizer?.name)} · ${fmtWhen(ev.drawn_at)}`
              : isOrganizer ? 'Press the button below when everyone is in.' : `Waiting for ${first(organizer?.name)} to draw.`}
          </Step>
          <Step n={3} done={allSeen} active={!!ev.drawn_at && !allSeen}
            title={ev.drawn_at ? `${seen} of ${members.length} have opened their match` : 'Everyone opens their match'} />
        </ol>
      </section>

      {ev.drawn_at && isIn && receiver && (
        <section className={'envelope' + (open ? ' open' : '')}>
          {!open ? (
            <button className="envelope-btn" onClick={reveal}>
              <span className="seal">🎅</span>
              <span className="env-title">{myMatch.seen_at ? 'Your match' : 'You have a match!'}</span>
              <span className="env-sub">{myMatch.seen_at ? 'Tap to see again' : 'Tap to open. Make sure nobody\'s peeking!'}</span>
            </button>
          ) : (
            <div className="reveal">
              <div className="tiny muted">You're Secret Santa for…</div>
              <Avatar p={receiver} size={72} />
              <div className="display">{receiver.name}!</div>
              {ev.budget && <div className="tiny">Spending limit: <strong>{ev.budget}</strong></div>}
              <a className="btn primary" href={`#/person/${receiver.id}`}>See {possessive(first(receiver.name))} list →</a>
              <button className="link tiny" onClick={() => setOpen(false)}>hide</button>
            </div>
          )}
        </section>
      )}
      {ev.drawn_at && !isIn && <section className="card"><p className="muted">You're not part of this group, but you can follow along.</p></section>}

      {drawing && <div className="card drawing"><span className="big-emoji shake">🎩</span><div>Shuffling {members.length} names…</div></div>}

      <section className="card">
        <h2>Who's in</h2>
        <ul className="roster">
          {members.map((p) => {
            const s = statusOf(p.id);
            const partner = p.partner_id && members.some((m) => m.id === p.partner_id) ? byId[p.partner_id] : null;
            return (
              <li key={p.id}>
                <Avatar p={p} size={40} />
                <div className="grow">
                  <div className="person-name sm">{p.name}{p.id === uid && <span className="tiny muted"> (you)</span>}</div>
                  {partner && <div className="tiny muted">💕 won't get {first(partner.name)}</div>}
                </div>
                {!ev.drawn_at && (isOrganizer && p.id !== uid
                  ? <button className="link tiny" onClick={() => removeM(p.id)}>remove</button>
                  : <span className="pill">In the hat</span>)}
                {ev.drawn_at && (
                  <div className="roster-status">
                    <span className={'pill ' + (s.assigned ? 'claimed' : '')}>{s.assigned ? '✓ Assigned' : '—'}</span>
                    <span className={'pill ' + (s.seen ? 'claimed' : '')}>{s.seen ? '👀 Opened' : 'Not opened'}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!ev.drawn_at && isOrganizer && notIn.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <span className="tiny muted">Add someone</span>
            <div className="chips">{notIn.map((p) => <button key={p.id} className="chip" onClick={() => add(p.id)}>+ {p.name}</button>)}</div>
          </div>
        )}
      </section>

      {isOrganizer && (
        <section className="card stack">
          <h2>Organizer</h2>
          {!ev.drawn_at ? (
            <>
              <button className="btn primary big" disabled={members.length < 3 || drawing} onClick={draw}>🎩 Draw names for all {members.length}</button>
              {members.length < 3 && <p className="tiny muted">Need at least 3 people.</p>}
              <button className="btn full" onClick={() => shareSanta(ev, members.length)}>💬 Tell the group they're in</button>
            </>
          ) : (
            <>
              <button className="btn primary full" onClick={() => shareSanta(ev, members.length)}>💬 Let everyone know names are drawn</button>
              <button className="btn ghost full" onClick={redraw}>Start over & redraw</button>
            </>
          )}
          <button className="link tiny" onClick={del}>Delete this group</button>
        </section>
      )}

      <p className="trust">🔒 The app picks names at random. Couples are never matched. Nobody, not even the organizer, can see who has whom.</p>
    </>
  );
}
