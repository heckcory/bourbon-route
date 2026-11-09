'use strict';
const VERSION = '3.3';
const SCOPE = self.registration.scope;
const PREFIX = 'bourbon-route:' + encodeURIComponent(new URL(SCOPE).pathname) + ':';
const CACHE = PREFIX + VERSION;
const MANIFEST = new URL('precache.json', SCOPE).href;
const SHELL = new URL('index.html', SCOPE).href;
function manifestURLs(data) {
  if (!data || data.version !== VERSION || !Array.isArray(data.assets) || !data.assets.length) throw new Error('Invalid offline manifest');
  const urls = [...new Set(data.assets.map(path => {
    if (typeof path !== 'string') throw new Error('Invalid asset');
    const url = new URL(path, SCOPE);
    if (!url.href.startsWith(SCOPE) || url.origin !== new URL(SCOPE).origin || url.search || url.hash) throw new Error('Asset outside application scope');
    return url.href;
  }))];
  for (const file of ['index.html', 'app.js', 'app.css', 'enhancements.js', 'enhancements.css', 'pwa.js', 'manifest.webmanifest']) {
    if (!urls.includes(new URL(file, SCOPE).href)) throw new Error('Missing core asset: ' + file);
  }
  return urls;
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const response = await fetch(MANIFEST, {cache: 'no-store'});
  if (!response.ok) throw new Error('Offline manifest unavailable');
  const urls = manifestURLs(await response.clone().json());
  const cache = await caches.open(CACHE);
  // A failed install cannot activate. Never delete an existing cache on failure.
  await Promise.all(urls.map(async url => {
    const asset = await fetch(url, {cache: 'reload'});
    if (!asset.ok || asset.type === 'opaque') throw new Error('Offline asset unavailable: ' + url);
    await cache.put(url, asset);
  }));
  await cache.put(MANIFEST, response);
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
async function navigation(request) {
  const cache = await caches.open(CACHE);
  let timer;
  const controller = new AbortController();
  try {
    const response = await Promise.race([
      fetch(request, {signal: controller.signal}),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Network timeout')); }, 4000); })
    ]);
    if (response.ok) return response;
    if (response.status < 500) return response;
  } catch (_) { /* Offline or slow connection: use the complete installed shell. */ }
  finally { clearTimeout(timer); }
  return await cache.match(SHELL) || new Response('Bourbon Route is not available offline yet. Connect once and use Check offline readiness.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  event.respondWith((async () => {
    if (request.mode === 'navigate') return navigation(request);
    const cache = await caches.open(CACHE);
    const saved = await cache.match(request);
    if (saved) return saved;
    try { return await fetch(request); }
    catch (_) { return new Response('Asset unavailable offline', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}}); }
  })());
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') { event.waitUntil(self.skipWaiting()); return; }
  if (!event.data || event.data.type !== 'CACHE_STATUS') return;
  event.waitUntil((async () => {
    let result = {version: VERSION, ready: false, missing: []};
    try {
      const cache = await caches.open(CACHE);
      const manifest = await cache.match(MANIFEST);
      if (!manifest) throw new Error('Manifest is not cached');
      const urls = manifestURLs(await manifest.json());
      for (const url of urls) if (!(await cache.match(url))) result.missing.push(url.slice(SCOPE.length) || './');
      result.ready = result.missing.length === 0;
    } catch (_) { result.error = 'Offline download has not completed'; }
    if (event.ports && event.ports[0]) event.ports[0].postMessage(result);
  })());
});
