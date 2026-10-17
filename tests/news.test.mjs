import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWS_SOURCES, createNewsService, handleNewsRequest, parseLogisticsRSS } from '../server/news.mjs';

const now = Date.parse('2026-10-17T12:00:00Z');
const industry = NEWS_SOURCES.find(source => source.id === 'supply-chain-dive');
const saudi = NEWS_SOURCES.find(source => source.id === 'saudi');
const pubDate = 'Fri, 16 Oct 2026 10:00:00 GMT';
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const item = ({ title = 'Warehouse inventory planning expands across supply chains', link = 'https://www.supplychaindive.com/news/warehouse-update/12345/', date = pubDate, description = 'A warehouse logistics update.', publisher = '' } = {}) => `<item><title>${escape(title)}</title><link>${escape(link)}</link><pubDate>${date}</pubDate><description>${description}</description>${publisher}</item>`;
const rss = entries => `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture feed</title>${entries}</channel></rss>`;

test('RSS items retain dated, attributed logistics news with warehouse categorization', () => {
  const result = parseLogisticsRSS(rss(item()), industry, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].publishedAt, '2026-10-16T10:00:00.000Z');
  assert.equal(result[0].sourceName, 'Supply Chain Dive');
  assert.ok(result[0].categories.includes('warehouse'));
  assert.equal(result[0].url, 'https://www.supplychaindive.com/news/warehouse-update/12345/');
});

test('RSS parser rejects DTDs, external entities, oversized XML and non-RSS payloads', () => {
  for (const xml of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', '<!ENTITY x "bad"><rss/>', 'x'.repeat(1048577), '<html>Denied</html>']) {
    assert.throws(() => parseLogisticsRSS(xml, industry, now), /Invalid or unsafe/);
  }
});

test('Titles and summaries are plain text and unsafe or foreign links are discarded', () => {
  const xml = rss(item({ title: '<b>Warehouse</b> & inventory', description: '<![CDATA[<script>alert(1)</script><b>Logistics</b> &amp; distribution]]>' }) + item({ link: 'javascript:alert(1)' }) + item({ link: 'https://evil.example/news/one' }) + item({ link: 'https://user:password@www.supplychaindive.com/news/unsafe/' }) + item({ link: 'http://www.supplychaindive.com/news/insecure/' }));
  const result = parseLogisticsRSS(xml, industry, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Warehouse & inventory');
  assert.equal(result[0].summary, 'Logistics & distribution');
});

test('Off-topic titles, invalid dates, far-future news, old news and duplicates are excluded', () => {
  const xml = rss(item() + item() + item({ title: 'Film awards and football results' }) + item({ date: 'not-a-date', link: 'https://www.supplychaindive.com/news/invalid/' }) + item({ date: 'Sun, 18 Oct 2026 12:00:00 GMT', link: 'https://www.supplychaindive.com/news/future/' }) + item({ date: 'Thu, 01 Jan 2026 12:00:00 GMT', link: 'https://www.supplychaindive.com/news/old/' }));
  assert.equal(parseLogisticsRSS(xml, industry, now).length, 1);
});

test('Saudi feed only accepts attributed official publishers and expected Google News article links', () => {
  const good = { title: 'الموانئ السعودية تعزز سلاسل الإمداد', link: 'https://news.google.com/rss/articles/official-one', publisher: '<source url="https://www.mawani.gov.sa">الهيئة العامة للموانئ</source>' };
  const xml = rss(item(good) + item({ ...good, link: 'https://news.google.com/rss/articles/foreign', publisher: '<source url="https://unrelated.example">مصدر آخر</source>' }) + item({ ...good, link: 'https://unrelated.example/article' }) + item({ ...good, link: 'https://news.google.com/rss/articles/missing-publisher', publisher: '' }));
  const result = parseLogisticsRSS(xml, saudi, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceName, 'الهيئة العامة للموانئ');
  assert.equal(result[0].publisherURL, 'https://www.mawani.gov.sa/');
  assert.ok(result[0].categories.includes('saudi'));
  assert.ok(result[0].categories.includes('shipping'));
});

test('Cache miss fetches both fixed sources once; category changes and quick refreshes reuse cache', async () => {
  let calls = 0;
  const service = createNewsService({ clock: () => now, fetchFeed: async source => { calls++; return source.id === industry.id ? rss(item()) : rss(''); } });
  const results = await Promise.all(Array.from({ length: 5 }, () => service.get()));
  assert.equal(calls, 2);
  assert.ok(results.every(result => result.status === 'ready' && result.items.length === 1));
  assert.equal((await service.get({ category: 'warehouse' })).items.length, 1);
  assert.equal((await service.get({ category: 'shipping' })).items.length, 0);
  assert.equal((await service.get({ refresh: true })).retryAfterSeconds, 60);
  assert.equal(calls, 2);
});

test('Blocked sources return an honest unavailable response without fabricated items; cooldown prevents retry loops', async () => {
  let calls = 0;
  const service = createNewsService({ clock: () => now, fetchFeed: async () => { calls++; throw new Error('HTTP 403'); } });
  const result = await service.get();
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.items, []);
  assert.equal(result.fetchedAt, null);
  assert.equal(result.unavailableSources.length, 2);
  assert.match(result.message, /تعذر/);
  await service.get({ refresh: true });
  assert.equal(calls, 2);
});

test('A failed later update preserves timestamped cached news and marks it stale', async () => {
  let time = now;
  let fail = false;
  const service = createNewsService({ clock: () => time, fetchFeed: async source => { if (fail) throw new Error('offline'); return source.id === industry.id ? rss(item()) : rss(''); } });
  const first = await service.get();
  time += 11 * 60000; fail = true;
  const result = await service.get();
  assert.equal(result.status, 'stale');
  assert.equal(result.stale, true);
  assert.equal(result.fetchedAt, first.fetchedAt);
  assert.deepEqual(result.items, first.items);
  assert.match(result.message, /محفوظة/);
});

test('Only successful source results are attributed when another source is unavailable', async () => {
  const service = createNewsService({ clock: () => now, fetchFeed: async source => { if (source.id === saudi.id) throw new Error('offline'); return rss(item()); } });
  const result = await service.get();
  assert.equal(result.status, 'partial');
  assert.equal(result.sources.length, 1);
  assert.equal(result.unavailableSources[0].sourceId, 'saudi');
  assert.equal(result.items.length, 1);
});

test('Valid empty feeds remain empty; unsupported categories cannot become fetch URLs', async () => {
  let calls = 0;
  const service = createNewsService({ clock: () => now, fetchFeed: async () => { calls++; return rss(''); } });
  const result = await service.get();
  assert.equal(result.status, 'empty');
  assert.deepEqual(result.items, []);
  await assert.rejects(service.get({ category: 'https://evil.example' }), /Unknown news category/);
  assert.equal(calls, 2);
  assert.throws(() => parseLogisticsRSS(rss(item()), { ...industry, url: 'https://evil.example' }, now), /Unknown news source/);
});

test('News endpoint validates methods and category before any fetch and ignores unrelated routes', async () => {
  const response = () => ({ headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; }, end(value = '') { this.body = value; } });
  const unknown = response();
  assert.equal(await handleNewsRequest({ url: '/api/other', method: 'GET' }, unknown), false);
  const invalid = response();
  assert.equal(await handleNewsRequest({ url: '/api/news?category=https%3A%2F%2Fevil.example', method: 'GET' }, invalid), true);
  assert.equal(invalid.statusCode, 400);
  const method = response();
  await handleNewsRequest({ url: '/api/news', method: 'POST' }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.Allow, 'GET, HEAD');
});
