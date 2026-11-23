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
    setD({
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
  else if (page === 'santa') body = <Santa ctx={ctx} />;
  else if (page === 'me') body = <MePage ctx={ctx} />;
  else body = <MyList ctx={ctx} />;

  const tab = page === 'person' ? 'family' : ['family', 'santa', 'me'].includes(page) ? page : 'home';
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
          <ItemForm onCancel={mine.length ? () => setAdding(false) : null}
            onSaved={() => { setAdding(false); load(); flash('Added to your list 🎁'); }} />
        )}
        {mine.length === 0 && !adding && <p className="muted">Your list is empty — add a few ideas!</p>}
        <ul className="items">
          {mine.map((item) => (
            <li key={item.id} className="item">
              {editing === item.id ? (
                <ItemForm item={item} onCancel={() => setEditing(null)}
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

function ItemBody({ item }) {
  return (
    <div className="item-body">
      {item.image_url
        ? <img src={item.image_url} alt="" className="thumb" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : <div className="thumb placeholder">🎁</div>}
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
        {item.notes && <div className="item-notes">{item.notes}</div>}
      </div>
    </div>
  );
}
function safeHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function ItemForm({ item, onSaved, onCancel }) {
  const [f, setF] = useState({
    url: item?.url || '', title: item?.title || '', price: item?.price || '',
    details: item?.details || '', notes: item?.notes || '', image_url: item?.image_url || '', favorite: item?.favorite || false,
  });
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function fetchPreview(url) {
    if (!/^https?:\/\//i.test(url)) return;
    setFetching(true);
    try {
      const r = await fetch('/api/preview?url=' + encodeURIComponent(url));
      const p = await r.json();
      setF((s) => ({
        ...s,
        title: s.title || p.title || '',
        price: s.price || p.price || '',
        image_url: p.image || s.image_url,
      }));
    } catch { /* fine — fill it in by hand */ }
    setFetching(false);
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
        <span>Link <em>(optional — paste and we'll fill in the rest)</em></span>
        <input type="url" inputMode="url" placeholder="https://…" value={f.url}
          onChange={set('url')}
          onPaste={(e) => { const v = e.clipboardData.getData('text'); setTimeout(() => fetchPreview(v.trim()), 0); }}
          onBlur={() => !f.title && fetchPreview(f.url.trim())} />
      </label>
      {fetching && <p className="tiny muted">Looking that up… ✨</p>}
      {f.image_url && (
        <div className="preview-img">
          <img src={f.image_url} alt="" referrerPolicy="no-referrer" onError={() => setF((s) => ({ ...s, image_url: '' }))} />
          <button type="button" className="link tiny" onClick={() => setF((s) => ({ ...s, image_url: '' }))}>remove photo</button>
        </div>
      )}
      <label className="field">
        <span>What is it?</span>
        <input required placeholder="e.g. Big cozy scarf, or “a surprise!”" value={f.title} onChange={set('title')} />
      </label>
      <div className="two">
        <label className="field">
          <span>Price</span>
          <input placeholder="$80" value={f.price} onChange={set('price')} />
        </label>
        <label className="field">
          <span>Size / color</span>
          <input placeholder="M, ivory" value={f.details} onChange={set('details')} />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <input placeholder="Any brand is fine, the green one, etc." value={f.notes} onChange={set('notes')} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.favorite} onChange={set('favorite')} /> ❤️ I really, really want this one
      </label>
      <div className="row gap">
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : item ? 'Save' : 'Add to my list'}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

/* ───────────────────────── family ───────────────────────── */

function Family({ ctx }) {
  const { uid, me, d } = ctx;
  const others = d.profiles.filter((p) => p.id !== uid && p.name);
  others.sort((a, b) => (b.id === me.partner_id) - (a.id === me.partner_id) || a.name.localeCompare(b.name));
  const myClaims = d.claims.filter((c) => c.claimer_id === uid);

  return (
    <>
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
            const mineFor = myClaims.filter((c) => c.recipient_id === p.id).length;
            return (
              <li key={p.id}>
                <a href={`#/person/${p.id}`} className="person">
                  <Avatar p={p} size={48} />
                  <div className="grow">
                    <div className="person-name">{p.name}{p.id === me.partner_id && <span className="pill soft">your partner 💕</span>}</div>
                    <div className="tiny muted">
                      {items.length} {items.length === 1 ? 'idea' : 'ideas'} · {open} still available
                      {mineFor > 0 && <> · <strong className="green">you've got {mineFor}</strong></>}
                    </div>
                  </div>
                  <span className="chev">›</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
      {myClaims.length > 0 && <MyShopping ctx={ctx} />}
      {others.length > 0 && <section className="card"><h2>Invite more family</h2><ShareLink /></section>}
    </>
  );
}

function MyShopping({ ctx }) {
  const { uid, d, byId } = ctx;
  const mine = d.claims.filter((c) => c.claimer_id === uid);
  return (
    <section className="card">
      <h2>My shopping list 🛍️</h2>
      <ul className="plain">
        {mine.map((c) => {
          const item = d.items.find((i) => i.id === c.item_id);
          return (
            <li key={c.id} className="row between">
              <span>{item ? item.title : c.note || 'Something special'}{c.kind === 'split' && <span className="pill soft">chipping in</span>}</span>
              <a href={`#/person/${c.recipient_id}`} className="tiny">for {first(byId[c.recipient_id]?.name)}</a>
            </li>
          );
        })}
      </ul>
    </section>
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
    const { error } = await supabase.from('claims').insert({ item_id: null, recipient_id: person.id, kind: 'full', note: offNote.trim() });
    if (error) alert(error.message); else { setOffNote(''); flash('🎁 Noted! Only other shoppers can see this.'); load(); }
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

function Santa({ ctx }) {
  const { d } = ctx;
  const [creating, setCreating] = useState(d.events.length === 0);
  return (
    <>
      <section className="card">
        <div className="row between">
          <h1 className="display">Secret Santa 🎅</h1>
          {!creating && <button className="btn sm" onClick={() => setCreating(true)}>+ New</button>}
        </div>
        {creating && <SantaCreate ctx={ctx} onDone={() => setCreating(false)} onCancel={d.events.length ? () => setCreating(false) : null} />}
        {!creating && d.events.length === 0 && <p className="muted">No Secret Santa yet.</p>}
      </section>
      {d.events.map((ev) => <SantaEvent key={ev.id} ctx={ctx} ev={ev} />)}
    </>
  );
}

function SantaCreate({ ctx, onDone, onCancel }) {
  const { uid, d, load, flash } = ctx;
  const people = d.profiles.filter((p) => p.name);
  const [name, setName] = useState('Sibling Secret Santa');
  const [budget, setBudget] = useState('');
  const [sel, setSel] = useState(new Set([uid]));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function create(e) {
    e.preventDefault();
    const { data: ev, error } = await supabase.from('santa_events').insert({ name, budget }).select().single();
    if (error) return alert(error.message);
    if (sel.size) await supabase.from('santa_members').insert([...sel].map((profile_id) => ({ event_id: ev.id, profile_id })));
    await load(); flash('Secret Santa created 🎅'); onDone();
  }

  return (
    <form className="stack" onSubmit={create}>
      <div className="two">
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Spending limit</span><input placeholder="$100" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      </div>
      <div className="field">
        <span>Who's in?</span>
        <div className="chips">
          {people.map((p) => (
            <button type="button" key={p.id} className={'chip' + (sel.has(p.id) ? ' on' : '')} onClick={() => toggle(p.id)}>
              {sel.has(p.id) ? '✓ ' : ''}{p.name}
            </button>
          ))}
        </div>
        <em className="tiny muted">You can add people later, until names are drawn.</em>
      </div>
      <div className="row gap">
        <button className="btn primary">Create</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function SantaEvent({ ctx, ev }) {
  const { uid, d, byId, load, flash } = ctx;
  const members = d.members.filter((m) => m.event_id === ev.id).map((m) => byId[m.profile_id]).filter(Boolean);
  const memberIds = new Set(members.map((m) => m.id));
  const match = d.matches.find((m) => m.event_id === ev.id && m.giver_id === uid);
  const receiver = match && byId[match.receiver_id];
  const isOrganizer = ev.created_by === uid;
  const [reveal, setReveal] = useState(false);
  const [editBudget, setEditBudget] = useState(false);
  const [budget, setBudget] = useState(ev.budget || '');
  const [drawing, setDrawing] = useState(false);
  const notIn = d.profiles.filter((p) => p.name && !memberIds.has(p.id));

  async function draw() {
    if (!confirm(`Draw names for ${members.length} people? Everyone will be able to see who they got (and only who they got).`)) return;
    setDrawing(true);
    const { error } = await supabase.rpc('draw_santa', { ev: ev.id });
    await new Promise((r) => setTimeout(r, 1200)); // a little suspense
    setDrawing(false);
    if (error) return alert(error.message);
    await load(); flash('🎩 Names drawn!');
  }
  async function reset() {
    if (!confirm('Re-open this Secret Santa? This throws out the current draw — everyone will get a new name when you draw again.')) return;
    const { error } = await supabase.rpc('reset_santa', { ev: ev.id });
    if (error) return alert(error.message);
    load();
  }
  async function add(id) { await supabase.from('santa_members').insert({ event_id: ev.id, profile_id: id }); load(); }
  async function removeM(id) { await supabase.from('santa_members').delete().eq('event_id', ev.id).eq('profile_id', id); load(); }
  async function saveBudget() { await supabase.from('santa_events').update({ budget }).eq('id', ev.id); setEditBudget(false); load(); }
  async function del() {
    if (!confirm(`Delete "${ev.name}" entirely?`)) return;
    await supabase.from('santa_events').delete().eq('id', ev.id); load();
  }

  return (
    <section className="card santa">
      <div className="row between">
        <h2>{ev.name}</h2>
        {ev.drawn_at ? <span className="pill claimed">Names drawn ✓</span> : <span className="pill">Open</span>}
      </div>
      <div className="budget">
        💸 Spending limit:{' '}
        {editBudget ? (
          <span className="row gap inline">
            <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="$100" className="sm-input" />
            <button className="btn sm" onClick={saveBudget}>Save</button>
          </span>
        ) : (
          <>
            <strong>{ev.budget || 'not set'}</strong>{' '}
            <button className="link tiny" onClick={() => setEditBudget(true)}>change</button>
          </>
        )}
      </div>

      {ev.drawn_at && memberIds.has(uid) && receiver && (
        <div className={'match' + (reveal ? ' open' : '')}>
          {!reveal ? (
            <button className="hat" onClick={() => setReveal(true)}>
              <span className="big-emoji">🎩</span>
              <span>Tap to see who you got!</span>
            </button>
          ) : (
            <div className="reveal">
              <div className="tiny muted">You're Secret Santa for…</div>
              <Avatar p={receiver} size={64} />
              <div className="display sm">{receiver.name}!</div>
              <a className="btn primary" href={`#/person/${receiver.id}`}>See {possessive(first(receiver.name))} list</a>
              <button className="link tiny" onClick={() => setReveal(false)}>hide</button>
            </div>
          )}
        </div>
      )}
      {drawing && <div className="drawing"><span className="big-emoji shake">🎩</span> Shuffling names…</div>}

      <div className="field">
        <span>{members.length} in the hat</span>
        <div className="chips">
          {members.map((p) => (
            <span key={p.id} className="chip on static">
              {p.name}
              {!ev.drawn_at && <button className="x" onClick={() => removeM(p.id)} aria-label={`Remove ${p.name}`}>×</button>}
            </span>
          ))}
        </div>
      </div>
      {!ev.drawn_at && notIn.length > 0 && (
        <div className="field">
          <span className="tiny muted">Add someone</span>
          <div className="chips">
            {notIn.map((p) => <button key={p.id} className="chip" onClick={() => add(p.id)}>+ {p.name}</button>)}
          </div>
        </div>
      )}
      <div className="row gap wrap">
        {!ev.drawn_at && <button className="btn primary" disabled={members.length < 3 || drawing} onClick={draw}>🎩 Draw names</button>}
        {ev.drawn_at && isOrganizer && <button className="btn ghost sm" onClick={reset}>Re-open & redraw</button>}
        {isOrganizer && <button className="btn ghost sm" onClick={del}>Delete</button>}
      </div>
      {!ev.drawn_at && members.length < 3 && <p className="tiny muted">Need at least 3 people.</p>}
      <p className="tiny muted">Partners are never matched with each other. Nobody, not even the organizer, can see the full list of pairs.</p>
    </section>
  );
}
