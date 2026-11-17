import { XMLParser } from 'fast-xml-parser';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { allowedUrl, safeFetch } from './safe-fetch.mjs';
import robotsParser from 'robots-parser';
import { setTimeout } from 'node:timers/promises';

const list = x => Array.isArray(x) ? x : x ? [x] : [];
const digest = s => createHash('sha256').update(s).digest('hex');
export function canonicalUrl(value, domains) {
  const url = allowedUrl(value, domains); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  url.searchParams.sort(); return url.href;
}
export function parseFeed(xml, source, now = new Date()) {
  if (Buffer.byteLength(xml) > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('UNSAFE_FEED');
  const doc = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false }).parse(xml);
  const entries = doc.rss ? list(doc.rss.channel?.item) : list(doc.feed?.entry);
  const domains = source.article_domains || [source.domain];
  const candidates = [];
  for (const entry of entries.slice(0, 60)) {
    try {
      const link = typeof entry.link === 'string' ? entry.link :
        list(entry.link).find(l => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'];
      const url = canonicalUrl(link, domains);
      const date = new Date(entry.pubDate || entry.published || entry.updated || '');
      if (!Number.isFinite(date.valueOf()) || date > new Date(now.valueOf() + 300_000) ||
        now.valueOf() - date.valueOf() > 7 * 86400_000) continue;
      const title = typeof entry.title === 'string' ? entry.title : entry.title?.['#text'];
      if (!title?.trim()) continue;
      candidates.push({ id: digest(url), source_id: digest(source.domain), source_name: source.name,
        canonical_url: url, title: title.trim().slice(0, 500), published_at: date.toISOString(),
        event_at: null, categories: source.categories, independence_group: source.independence_group || source.domain,
        freshness: now.valueOf() - date.valueOf() <= 48 * 3600_000 ? '48h' : '7d' });
    } catch { /* Invalid or unapproved links never become candidates. */ }
  }
  return [...new Map(candidates.map(c => [c.canonical_url, c])).values()];
}
export function extractArticle(html, selector = 'article') {
  const $ = load(html);
  $('script,style,noscript,nav,footer,form,iframe,svg,template').remove();
  const article = $(selector).first();
  const text = article.find('p').map((_, el) => $(el).text().trim()).get().filter(Boolean).join('\n\n');
  if (text.length < 200) throw Error('INSUFFICIENT_ARTICLE_TEXT');
  if (text.length > 40_000) throw Error('ARTICLE_TOO_LONG');
  return text;
}
// A source policy must be manually reviewed. Robots access alone grants no rewrite rights.
export function requireSourcePolicy(source, operation) {
  if (source.status !== 'enabled' || !source.reviewed_at || !source[operation + '_enabled']) throw Error('SOURCE_NOT_APPROVED');
  if (operation === 'fetch' && source.rewrite_policy !== 'allowed') throw Error('REWRITE_POLICY_NOT_APPROVED');
}
export async function checkRobots(url, domains, fetcher = safeFetch) {
  const target = allowedUrl(url, domains);
  const robotsUrl = target.origin + '/robots.txt';
  let text;
  try { text = (await fetcher(robotsUrl, domains, { maxBytes: 500_000 })).text; }
  catch (error) {
    if (['SOURCE_HTTP_404', 'SOURCE_HTTP_410'].includes(error.message)) return { status: 'absent', allowed: true };
    throw error;
  }
  const allowed = robotsParser(robotsUrl, text).isAllowed(target.href, 'DayDayDigest') !== false;
  if (!allowed) throw Error('ROBOTS_DENIED');
  return { status: 'checked', allowed };
}
export async function discoverSources(registry, fetcher = safeFetch) {
  const candidates = [], failures = [];
  for (const source of registry) {
    if (source.status !== 'enabled' || !source.discovery_enabled) continue;
    try {
      requireSourcePolicy(source, 'discovery');
      // Enabling a feed also requires an explicit recorded robots/terms audit.
      if (!source.robots_reviewed_at || source.robots_allowed !== true) throw Error('ROBOTS_REVIEW_REQUIRED');
      for (const feed of source.feed_urls.slice(0, 5)) {
        const domains = source.feed_domains || [source.domain];
        await checkRobots(feed, domains, fetcher);
        await setTimeout(1000 / Math.max(0.1, Math.min(source.rate_limit || 1, 1)));
        const fetched = await fetcher(feed, domains);
        candidates.push(...parseFeed(fetched.text, source));
      }
    } catch (error) { failures.push({ source: source.name, error: error.message }); }
    if (candidates.length >= 60) break;
  }
  return { candidates: [...new Map(candidates.map(c => [c.id, c])).values()].slice(0, 60), failures };
}
export async function fetchCandidate(candidate, source, fetcher = safeFetch) {
  requireSourcePolicy(source, 'fetch');
  if (!source.robots_reviewed_at || source.robots_allowed !== true) throw Error('ROBOTS_REVIEW_REQUIRED');
  const domains = source.article_domains || [source.domain];
  await checkRobots(candidate.canonical_url, domains, fetcher);
  await setTimeout(1000 / Math.max(0.1, Math.min(source.rate_limit || 1, 1)));
  const result = await fetcher(candidate.canonical_url, domains);
  if (!/^text\/html/i.test(result.mime)) throw Error('ARTICLE_MIME_REJECTED');
  const text = extractArticle(result.text, source.article_selector || 'article');
  return { ...candidate, canonical_url: result.url, evidence: text, content_hash: digest(text),
    read_at: new Date().toISOString(), rights_reviewed: true,
    retention_days: Math.min(source.evidence_retention_days ?? 7, 7) };
}
