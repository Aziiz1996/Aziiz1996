import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const MAX_BYTES = 1024 * 1024;
const CACHE_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const MAX_ITEMS = 60;
const SAUDI_HOSTS = new Set(['spa.gov.sa', 'www.spa.gov.sa', 'mawani.gov.sa', 'www.mawani.gov.sa', 'tga.gov.sa', 'www.tga.gov.sa']);
const saudiQuery = 'لوجستيات OR سلاسل الإمداد OR الموانئ (site:spa.gov.sa OR site:mawani.gov.sa OR site:tga.gov.sa)';

// Only these fixed, public feeds are fetched. Request parameters never supply URLs.
export const NEWS_SOURCES = Object.freeze([
  Object.freeze({ id: 'saudi', name: 'جهات سعودية رسمية عبر أخبار Google', kind: 'saudi', url: `https://news.google.com/rss/search?q=${encodeURIComponent(saudiQuery)}&hl=ar&gl=SA&ceid=SA%3Aar` }),
  Object.freeze({ id: 'supply-chain-dive', name: 'Supply Chain Dive', kind: 'industry', url: 'https://www.supplychaindive.com/feeds/news/' }),
]);
export const NEWS_CATEGORIES = Object.freeze(['all', 'saudi', 'shipping', 'procurement', 'warehouse']);

function plainText(value, limit = 500) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dec) => {
      const point = Number.parseInt(hex || dec, hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : ' ';
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name])
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

function field(xml, name) {
  return xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'))?.[1] ?? '';
}

function safeURL(raw) {
  try {
    const value = new URL(plainText(raw, 3000));
    if (value.protocol !== 'https:' || value.username || value.password || value.port || !value.hostname) return null;
    value.hash = '';
    return value;
  } catch { return null; }
}

function sourceURL(xml) {
  const raw = xml.match(/<source\b[^>]*\burl\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1];
  return raw ? safeURL(raw) : null;
}

function topicsFor(title, sourceKind) {
  const topics = [];
  if (sourceKind === 'saudi' || /\bSaudi\b|السعودي|المملكة/iu.test(title)) topics.push('saudi');
  if (/\b(ship\w*|freight|port|ports|ocean|maritime|trucking|transport\w*|cargo|airline\w*|airfreight)\b|شحن|نقل|موانئ|ميناء|بحري|بحرية|جوي|حاويات|سفن/iu.test(title)) topics.push('shipping');
  if (/\b(procure\w*|purchas\w*|sourc\w*|supplier\w*|tender\w*|contract\w*)\b|مشتريات|مشتري|توريد|مورد|عقود|مناقص/iu.test(title)) topics.push('procurement');
  if (/\b(warehous\w*|inventor\w*|fulfill\w*|stock|distribution cent\w*)\b|مخزون|مخازن|مستودع|تخزين|توزيع|مستودعات/iu.test(title)) topics.push('warehouse');
  return topics;
}

const LOGISTICS_TITLE = /\b(supply[ -]?chain|logistic\w*|ship\w*|freight|port|ports|ocean|maritime|trucking|transport\w*|cargo|airfreight|warehous\w*|inventor\w*|fulfill\w*|procure\w*|purchas\w*|supplier\w*|sourc\w*|distribution)\b|لوجست|إمداد|امداد|شحن|نقل|موانئ|ميناء|بحري|حاويات|سفن|مخزون|مخازن|مستودع|مستودعات|تخزين|مشتريات|توريد|سلاسل التوريد/iu;

/** Bounded RSS 2 parser: no DTD, entity expansion, external fetch, or HTML execution. */
export function parseLogisticsRSS(xml, source, now = Date.now()) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml, 'utf8') > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<rss\b/i.test(xml)) throw new Error('Invalid or unsafe RSS feed');
  if (!NEWS_SOURCES.some(item => item.id === source.id && item.url === source.url)) throw new Error('Unknown news source');
  const items = [];
  const seen = new Set();
  const entries = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) ?? [];
  for (const entry of entries.slice(0, 250)) {
    const title = plainText(field(entry, 'title'), 240);
    if (!title || !LOGISTICS_TITLE.test(title)) continue;
    const article = safeURL(field(entry, 'link'));
    const published = Date.parse(plainText(field(entry, 'pubDate'), 100));
    if (!article || !Number.isFinite(published) || published > now + 6 * 60 * 60 * 1000 || published < now - 120 * 86400000) continue;
    let sourceName = source.name;
    let publisherURL = source.kind === 'saudi' ? null : 'https://www.supplychaindive.com/';
    if (source.kind === 'saudi') {
      const publisher = sourceURL(entry);
      if (!publisher || !SAUDI_HOSTS.has(publisher.hostname) || article.hostname !== 'news.google.com' || !article.pathname.startsWith('/rss/articles/')) continue;
      sourceName = plainText(field(entry, 'source'), 100) || publisher.hostname;
      publisherURL = publisher.origin + '/';
    } else if (!['supplychaindive.com', 'www.supplychaindive.com'].includes(article.hostname)) continue;
    const key = article.href;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: createHash('sha256').update(key).digest('hex').slice(0, 20),
      title, summary: plainText(field(entry, 'description'), 400), url: article.href,
      sourceName, publisherURL, feedName: source.name,
      publishedAt: new Date(published).toISOString(), categories: topicsFor(title, source.kind),
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_ITEMS);
}

export async function fetchNewsRSS(source) {
  if (!NEWS_SOURCES.some(item => item.id === source.id && item.url === source.url)) throw new Error('Unknown news source');
  // Child inherits the managed environment's HTTPS proxy and CA trust; TLS stays enabled.
  const { stdout } = await run('curl', [
    '--fail', '--silent', '--show-error', '--location', '--max-redirs', '2',
    '--connect-timeout', '5', '--max-time', '15', '--max-filesize', String(MAX_BYTES),
    '--proto', '=https', '--proto-redir', '=https', source.url,
  ], { encoding: 'utf8', maxBuffer: MAX_BYTES, timeout: 18000, windowsHide: true });
  return stdout;
}

export function createNewsService({ fetchFeed = fetchNewsRSS, clock = Date.now } = {}) {
  let cache = null;
  let lastAttempt = -Infinity;
  let inflight = null;
  let lastErrors = [];
  let failedSinceCache = false;

  async function fetchAll() {
    const now = clock();
    const results = await Promise.allSettled(NEWS_SOURCES.map(async source => ({ source, items: parseLogisticsRSS(await fetchFeed(source), source, now) })));
    const successful = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    lastErrors = results.flatMap((result, index) => result.status === 'rejected' ? [{ sourceId: NEWS_SOURCES[index].id, sourceName: NEWS_SOURCES[index].name, status: 'unavailable' }] : []);
    if (successful.length) {
      const seen = new Set();
      const items = successful.flatMap(result => result.items).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).filter(item => { if (seen.has(item.url)) return false; seen.add(item.url); return true; }).slice(0, MAX_ITEMS);
      cache = { items, fetchedAt: new Date(clock()).toISOString(), fetchedTime: clock(), sources: successful.map(result => ({ id: result.source.id, name: result.source.name, itemCount: result.items.length })) };
      failedSinceCache = false;
    } else failedSinceCache = true;
  }

  return {
    async get({ category = 'all', refresh = false } = {}) {
      if (!NEWS_CATEGORIES.includes(category)) throw new RangeError('Unknown news category');
      const now = clock();
      const expired = !cache || now - cache.fetchedTime >= CACHE_MS;
      if ((expired || refresh) && now - lastAttempt >= RETRY_MS) {
        if (!inflight) {
          lastAttempt = now;
          inflight = fetchAll().finally(() => { inflight = null; });
        }
        await inflight;
      } else if (inflight) await inflight;
      const stale = !!cache && (clock() - cache.fetchedTime >= CACHE_MS || failedSinceCache);
      const items = (cache?.items ?? []).filter(item => category === 'all' || item.categories.includes(category));
      const retryAfterSeconds = Math.max(0, Math.ceil((RETRY_MS - (clock() - lastAttempt)) / 1000));
      return {
        status: !cache ? 'unavailable' : stale ? 'stale' : lastErrors.length ? 'partial' : cache.items.length ? 'ready' : 'empty',
        category, items, fetchedAt: cache?.fetchedAt ?? null, stale,
        nextRefreshAt: cache ? new Date(cache.fetchedTime + CACHE_MS).toISOString() : null,
        retryAfterSeconds, sources: cache?.sources ?? [], unavailableSources: lastErrors,
        message: !cache ? 'تعذر جلب أخبار التخصص الآن. أعد المحاولة لاحقاً؛ لن نعرض أخباراً مختلقة.' : stale ? 'تعذر التحديث؛ هذه آخر نسخة محفوظة، وقد تكون غير حديثة.' : lastErrors.length ? 'وصلت أخبار بعض المصادر، وتعذر الوصول إلى مصادر أخرى.' : !cache.items.length ? 'لم تصل أخبار حديثة مطابقة للتخصص من المصادر المتاحة.' : 'أخبار مرتبطة بالتخصص من المصادر المذكورة؛ افتح المصدر لقراءة التفاصيل.',
      };
    },
  };
}

const newsService = createNewsService();

/** Returns false for other paths; true after responding to /api/news. */
export async function handleNewsRequest(req, res) {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return false; }
  if (url.pathname !== '/api/news') return false;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (code, body) => { res.statusCode = code; res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body)); return true; };
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return send(405, { error: 'Method not allowed' }); }
  const category = url.searchParams.get('category') || 'all';
  if (!NEWS_CATEGORIES.includes(category)) return send(400, { error: 'تصنيف الأخبار غير صالح.' });
  try { return send(200, await newsService.get({ category, refresh: url.searchParams.get('refresh') === '1' })); }
  catch { return send(503, { error: 'تعذر تحميل أخبار التخصص الآن.' }); }
}
