import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';

export function publicAddress(ip) {
  if (!isIP(ip)) return false;
  if (ip.includes(':')) {
    const x = ip.toLowerCase();
    const first = Number.parseInt(x.split(':')[0] || '0', 16);
    const second = Number.parseInt(x.split(':')[1] || '0', 16);
    // Only ordinary global unicast; reject local, mapped, documentation and transition ranges.
    return first >= 0x2000 && first < 0x3ffe && !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) && first !== 0x2002;
  }
  const [a, b, c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99) ||
    a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
    a === 203 && b === 0 && c === 113);
}
export function allowedUrl(value, domains) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443' ||
    !domains.includes(u.hostname) || isIP(u.hostname)) throw Error('SSRF_REJECTED');
  return u;
}
export function createSafeFetcher({ resolve = lookup, transport = request, proxyForUrl = getProxyForUrl } = {}) {
  return async function fetchApproved(value, domains, { maxBytes = 2_000_000, timeoutMs = 10_000 } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 10_000_000 || timeoutMs > 30_000 || timeoutMs < 1) {
      throw Error('INVALID_FETCH_LIMITS');
    }
    for (let redirects = 0; redirects < 4; redirects++) {
      const url = allowedUrl(value, domains);
      const addresses = await resolve(url.hostname, { all: true });
      if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw Error('SSRF_REJECTED');
      const pinned = addresses[0];
      const proxyUrl = proxyForUrl(url.href);
      let agent = false;
      if (proxyUrl) {
        try { agent = new HttpsProxyAgent(proxyUrl); } catch { throw Error('SOURCE_PROXY_CONFIGURATION'); }
      }
      // With a proxy, CONNECT also targets the validated IP. TLS SNI/certificate
      // verification and HTTP Host still use the original approved hostname.
      const wireUrl = new URL(url);
      if (proxyUrl) wireUrl.hostname = pinned.family === 6 ? '[' + pinned.address + ']' : pinned.address;
      const result = await new Promise((done, reject) => {
        const req = transport(wireUrl, { method: 'GET', agent, servername: url.hostname,
          family: pinned.family, signal: AbortSignal.timeout(timeoutMs),
          lookup: (_hostname, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
          headers: { Host: url.host, 'User-Agent': 'DayDayDigest/0.1', 'Accept-Encoding': 'identity' },
        }, res => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            const location = res.headers.location;
            res.destroy();
            if (!location) { reject(Error('SOURCE_REDIRECT_INVALID')); return; }
            done({ redirect: new URL(location, url).href }); return;
          }
          if (status < 200 || status >= 300) { res.destroy(); reject(Error('SOURCE_HTTP_' + status)); return; }
          if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
            res.destroy(); reject(Error('SOURCE_ENCODING_UNSUPPORTED')); return;
          }
          if (Number(res.headers['content-length']) > maxBytes) { res.destroy(); reject(Error('SOURCE_TOO_LARGE')); return; }
          const parts = []; let size = 0;
          res.on('data', part => {
            size += part.length;
            if (size > maxBytes) { res.destroy(); reject(Error('SOURCE_TOO_LARGE')); } else parts.push(part);
          });
          res.on('error', reject);
          res.on('end', () => {
            const bytes = Buffer.concat(parts);
            done({ text: bytes.toString('utf8'), bytes, url: url.href, mime: res.headers['content-type'] || '' });
          });
        });
        req.on('error', reject); req.end();
      });
      if (result.redirect) { value = result.redirect; continue; }
      return result;
    }
    throw Error('TOO_MANY_REDIRECTS');
  };
}
export const safeFetch = createSafeFetcher();
