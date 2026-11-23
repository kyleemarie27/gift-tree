// Demo mode (?demo): an in-memory stand-in for Supabase with sample data.
// Nothing is saved; refresh to reset.
const P = (id, name, extra = {}) => ({ id, name, partner_id: null, tops: '', bottoms: '', shoes: '', notes: '', ...extra });
const db = {
  profiles: [
    P('me', 'Kylee', { partner_id: 'ty', tops: 'S', bottoms: 'M / 8 / 28', shoes: '9', notes: 'Love ivory + green. Gold jewelry, not silver.' }),
    P('ty', 'Ty', { partner_id: 'me', tops: 'M', bottoms: '32x30', shoes: '10.5' }),
    P('col', 'Colton', { partner_id: 'kat', tops: 'L', bottoms: '32x32', shoes: '11', notes: 'Loves fly fishing. Please no more mugs!' }),
    P('kat', 'Kat', { partner_id: 'col', tops: 'XS', bottoms: '26', shoes: '7.5' }),
    P('con', 'Connor', { tops: 'L', shoes: '12' }),
    P('deb', 'Debbie', { partner_id: 'geo', notes: 'Gardening, puzzles, anything for the grandkids 💕' }),
    P('geo', 'Geoff', { partner_id: 'deb' }),
  ],
  items: [
    { id: 'i1', owner_id: 'me', title: 'Big scarf', url: 'https://www.acnestudios.com', price: '$80', details: 'Oversized', notes: '', favorite: true, colors: [{ name: 'Ivory', hex: '#f3ecd8' },{ name: 'Beige', hex: '#d9c4a3' }] },
    { id: 'i2', owner_id: 'me', title: 'Travel jewelry organizer', url: 'https://www.awaytravel.com', price: '$70', details: '', notes: '', favorite: false, colors: [{ name: 'Navy', hex: '#1f2f57' }] },
    { id: 'i3', owner_id: 'me', title: 'Sauté Pan', url: 'https://www.carawayhome.com/products/saute-pan', image_url: 'https://cdn.shopify.com/s/files/1/0258/6273/3906/files/saute-pan_cream_hero.jpg?v=1785827494', price: '$165', details: '', notes: '', favorite: false, colors: [{ name: 'Sage', hex: '#9caf88' },{ name: 'Cream', hex: '#efe6d2' }] },
    { id: 'i4', owner_id: 'me', title: 'A surprise something you think I’d like!', url: '', price: '', details: '', notes: '', favorite: false },
    { id: 'c1', owner_id: 'col', title: 'Waterproof fly box', url: 'https://www.orvis.com', price: '$45', details: '', notes: 'The clear one', favorite: true },
    { id: 'c2', owner_id: 'col', title: 'Merino base layer', url: '', price: '$110', details: 'L', notes: '', favorite: false, colors: [{ name: 'Grey', hex: '#9a9a9a' },{ name: 'Black', hex: '#1f1f1f' }] },
    { id: 'c3', owner_id: 'col', title: 'Grill brush', url: '', price: '$25', details: '', notes: '', favorite: false },
    { id: 'k1', owner_id: 'kat', title: 'Silk pillowcase', url: '', price: '$89', details: 'Queen', notes: '', favorite: true, colors: [{ name: 'Pink', hex: '#f0a8c0' }] },
    { id: 'k2', owner_id: 'kat', title: 'Pottery class', url: '', price: '$120', details: '', notes: 'Any studio near us!', favorite: false },
    { id: 'n1', owner_id: 'con', title: 'Running headphones', url: '', price: '$150', details: 'Black', notes: '', favorite: true },
    { id: 'd1', owner_id: 'deb', title: 'Garden kneeler', url: '', price: '$40', details: '', notes: '', favorite: false },
    { id: 't1', owner_id: 'ty', title: 'Cast iron skillet', url: '', price: '$60', details: '12 inch', notes: '', favorite: false },
  ].map((i) => ({ image_url: '', colors: [], created_at: '', ...i })),
  claims: [
    { id: 'x1', item_id: 'c2', recipient_id: 'col', claimer_id: 'deb', kind: 'full', note: '' },
    { id: 'x2', item_id: 'k1', recipient_id: 'kat', claimer_id: 'ty', kind: 'split', note: '' },
    { id: 'x3', item_id: null, recipient_id: 'con', claimer_id: 'deb', kind: 'full', note: 'Cozy socks' },
  ],
  santa_events: [{ id: 'e1', name: 'Sibling Secret Santa', budget: '$100', exchange_date: '2026-12-24', created_by: 'me', drawn_at: null, drawn_by: null }],
  santa_members: ['me', 'ty', 'col', 'kat', 'con'].map((p) => ({ event_id: 'e1', profile_id: p })),
  santa_matches: [],
  // hidden: claims for "me" (only the count shows)
  secret: [{ item_id: 'i1' }, { item_id: 'i2' }, { item_id: null }, { item_id: null }, { item_id: 'i3' }],
};
let n = 0;
const blobs = {};
const uid = () => 'demo' + ++n;

function table(name) {
  let op = 'select', payload = null, filters = [], single = false;
  const q = {
    select: () => q, order: () => q,
    eq: (k, v) => { filters.push([k, v]); return q; },
    single: () => { single = true; return q; },
    insert: (rows) => { op = 'insert'; payload = [].concat(rows); return q; },
    update: (row) => { op = 'update'; payload = row; return q; },
    delete: () => { op = 'delete'; return q; },
    then: (res, rej) => Promise.resolve(run()).then(res, rej),
  };
  const match = (r) => filters.every(([k, v]) => r[k] === v);
  function run() {
    const rows = db[name];
    if (op === 'insert') {
      const added = payload.map((r) => ({ id: uid(), colors: [], owner_id: 'me', claimer_id: 'me', created_by: 'me', created_at: new Date().toISOString(), ...r }));
      rows.push(...added);
      return { data: single ? added[0] : added, error: null };
    }
    if (op === 'update') { rows.filter(match).forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
    if (op === 'delete') { db[name] = rows.filter((r) => !match(r)); return { data: null, error: null }; }
    let out = rows.filter(match);
    if (name === 'claims') out = out.filter((c) => c.recipient_id !== 'me');
    if (name === 'santa_matches') out = out.filter((m) => m.giver_id === 'me');
    return { data: single ? out[0] : out, error: null };
  }
  return q;
}

function draw(ev) {
  const ids = db.santa_members.filter((m) => m.event_id === ev).map((m) => m.profile_id);
  const partner = (a) => db.profiles.find((p) => p.id === a)?.partner_id;
  for (let t = 0; t < 2000; t++) {
    const s = [...ids].sort(() => Math.random() - 0.5);
    if (s.every((a, i) => partner(a) !== s[(i + 1) % s.length])) {
      db.santa_matches = db.santa_matches.filter((m) => m.event_id !== ev)
        .concat(s.map((a, i) => ({ event_id: ev, giver_id: a, receiver_id: s[(i + 1) % s.length] })));
      Object.assign(db.santa_events.find((e) => e.id === ev), { drawn_at: new Date().toISOString(), drawn_by: 'me' });
      // pretend a couple of people already opened theirs
      db.santa_matches.forEach((m) => { if (['ty', 'col'].includes(m.giver_id)) m.seen_at = new Date().toISOString(); });
      return { data: null, error: null };
    }
  }
  return { data: null, error: { message: 'Could not find a valid draw' } };
}

export const demoClient = {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'me' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => { window.location.href = window.location.pathname; },
  },
  from: table,
  storage: {
    from: () => ({
      upload: async (path, blob) => { blobs[path] = URL.createObjectURL(blob); return { data: { path }, error: null }; },
      getPublicUrl: (path) => ({ data: { publicUrl: blobs[path] } }),
    }),
  },
  rpc: async (fn, args = {}) => {
    if (fn === 'my_gift_count') return { data: db.secret.length, error: null };
    if (fn === 'peek_my_claims') return { data: db.secret.filter((s) => s.item_id), error: null };
    if (fn === 'draw_santa') return draw(args.ev);
    if (fn === 'reset_santa') {
      db.santa_matches = db.santa_matches.filter((m) => m.event_id !== args.ev);
      db.santa_events.find((e) => e.id === args.ev).drawn_at = null;
      return { data: null, error: null };
    }
    if (fn === 'santa_status') {
      return { data: db.santa_members.filter((m) => m.event_id === args.ev).map((m) => {
        const x = db.santa_matches.find((y) => y.event_id === args.ev && y.giver_id === m.profile_id);
        return { profile_id: m.profile_id, assigned: !!x, seen: !!x?.seen_at };
      }), error: null };
    }
    if (fn === 'mark_santa_seen') {
      db.santa_matches.forEach((m) => { if (m.event_id === args.ev && m.giver_id === 'me') m.seen_at ||= new Date().toISOString(); });
      return { data: null, error: null };
    }
    if (fn === 'set_partner') { const me = db.profiles.find((p) => p.id === 'me'); me.partner_id = args.p; return { data: null, error: null }; }
    return { data: null, error: null };
  },
};
