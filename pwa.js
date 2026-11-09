/* Manual install and verified offline readiness. No automatic prompts or reloads. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const install = byId('install-app'), check = byId('offline-check'), apply = byId('apply-update');
  const offline = byId('offline-status'), update = byId('update-status'), help = byId('install-help');
  const say = (node, text) => { if (node) { node.textContent = text; node.setAttribute('role', 'status'); } };
  let deferredPrompt, registration, reloadRequested = false;
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (help) help.hidden = true;
  if (apply) apply.hidden = true;
  if (install && isInstalled()) install.hidden = true;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredPrompt = event;
    if (install && !isInstalled()) { install.hidden = false; install.textContent = 'Install app'; }
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; if (install) install.hidden = true; if (help) help.hidden = true; });
  if (install) install.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt; deferredPrompt = null;
      try { await prompt.prompt(); await prompt.userChoice; } catch (_) { say(byId('install-help-text'), 'Use your browser menu to install or add this site to your home screen.'); if (help) help.hidden = false; }
    } else if (help) {
      help.hidden = false;
      say(help, /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'In Safari, tap Share, then Add to Home Screen. Offline access is ready only after the check below succeeds.' : 'Use your browser menu to choose Install app or Add to Home Screen, if offered. You can also use this site normally in your browser.');
    }
  });
  const dismiss = byId('dismiss-install-help');
  if (dismiss) dismiss.addEventListener('click', () => { if (help) help.hidden = true; });
  // Help is only ever shown by an explicit click, so dismissal survives reloads without storage.
  function showUpdate() {
    if (!registration || !registration.waiting) return;
    say(update, 'An update is ready. Apply it when you are ready to reload this page.');
    if (apply) apply.hidden = false;
  }
  async function readiness() {
    if (!('serviceWorker' in navigator)) { say(offline, 'This browser does not support offline installation.'); return; }
    const worker = navigator.serviceWorker.controller || (registration && registration.active);
    if (!worker) { say(offline, 'Preparing offline files. Keep this page open and check again shortly.'); return; }
    say(offline, 'Checking saved offline files…');
    try {
      const result = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); reject(new Error('timeout')); }, 7000);
        channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
        worker.postMessage({type: 'CACHE_STATUS'}, [channel.port2]);
      });
      say(offline, result.ready ? 'Ready offline: itinerary, artwork and Photo Hunt. Live maps, directions and booking sites still need internet.' : 'Offline files are incomplete. Connect to the internet and check again.');
    } catch (_) { say(offline, 'Could not verify offline readiness. Reconnect and check again; do not rely on offline access yet.'); }
  }
  if (apply) apply.addEventListener('click', () => {
    if (registration && registration.waiting) { reloadRequested = true; apply.disabled = true; say(update, 'Applying update…'); registration.waiting.postMessage({type: 'SKIP_WAITING'}); }
  });
  if (check) check.addEventListener('click', async () => {
    if (registration && navigator.onLine) { try { await registration.update(); } catch (_) {} }
    await readiness(); showUpdate();
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadRequested) location.reload(); else readiness(); });
    navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'}).then(reg => {
      registration = reg; showUpdate(); readiness();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (worker) worker.addEventListener('statechange', () => { if (worker.state === 'installed') { showUpdate(); readiness(); } });
      });
    }).catch(() => say(offline, 'Offline setup failed. The online site still works; reconnect and reload to try again.'));
  } else readiness();
  window.addEventListener('online', readiness);
  window.addEventListener('offline', readiness);
})();
