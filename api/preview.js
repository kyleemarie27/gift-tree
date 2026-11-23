// Vercel serverless function: GET /api/preview?url=...
// Returns { title, image, price, site } scraped from Open Graph / JSON-LD tags.
// Best-effort: some stores (Amazon) block bots, so the app always lets you type it in.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decode(s = '') {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}

function meta(html, keys) {
  for (const k of keys) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    if (m && m[1]) return decode(m[1]);
  }
  return '';
}

function jsonLdProduct(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      let data = JSON.parse(b[1].trim());
      const queue = Array.isArray(data) ? [...data] : [data];
      while (queue.length) {
        const d = queue.shift();
        if (!d || typeof d !== 'object') continue;
        if (d['@graph']) queue.push(...d['@graph']);
        const type = [].concat(d['@type'] || []).join(',');
        if (/Product/i.test(type)) {
          const offer = [].concat(d.offers || [])[0] || {};
          const price = offer.price || offer.lowPrice || (offer.priceSpecification || {}).price;
          const img = [].concat(d.image || [])[0];
          return {
            title: d.name || '',
            image: typeof img === 'string' ? img : (img && img.url) || '',
            price: price ? String(price) : '',
            currency: offer.priceCurrency || '',
          };
        }
      }
    } catch { /* ignore bad JSON */ }
  }
  return {};
}

export default async function handler(req, res) {
  const raw = (req.query && req.query.url) || '';
  let target;
  try {
    target = new URL(raw);
    if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(target.hostname)) throw new Error('private');
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const site = target.hostname.replace(/^www\./, '');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(target.toString(), {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return res.status(200).json({ title: '', image: '', price: '', site });
    const html = (await r.text()).slice(0, 1_500_000);

    const ld = jsonLdProduct(html);
    const titleTag = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    let title = ld.title || meta(html, ['og:title', 'twitter:title']) || decode(titleTag);
    let image = ld.image || meta(html, ['og:image', 'og:image:secure_url', 'twitter:image']);
    let price = ld.price || meta(html, ['product:price:amount', 'og:price:amount', 'price']);
    const currency = ld.currency || meta(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']);

    if (image && image.startsWith('//')) image = 'https:' + image;
    if (image && image.startsWith('/')) image = target.origin + image;
    if (price && /^[\d.,]+$/.test(price)) {
      const n = Number(price.replace(/,/g, ''));
      price = (currency && currency !== 'USD' ? currency + ' ' : '$') + (Number.isFinite(n) ? Math.round(n) : price);
    }
    title = title.replace(/\s*[|–-]\s*[^|–-]{2,40}$/, '').slice(0, 140); // drop " | Store Name"

    res.setHeader('cache-control', 's-maxage=86400');
    return res.status(200).json({ title, image, price, site });
  } catch {
    return res.status(200).json({ title: '', image: '', price: '', site });
  }
}
