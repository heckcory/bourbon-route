/* Install guidance, verified offline readiness and opt-in updates. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const install = byId('install-app'), check = byId('offline-check'), apply = byId('apply-update');
  const offline = byId('offline-status'), update = byId('update-status'), help = byId('install-help');
  const say = (node, text) => { if (node) { node.textContent = text; node.setAttribute('role', 'status'); } };
  let deferredPrompt, registration, reloadRequested = false;
  let relatedInstalled = false;
  const isInstalled = () => relatedInstalled || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const banner = byId('install-banner'), bannerAction = byId('install-banner-action');
  const bannerHelp = byId('install-banner-help'), bannerDismiss = byId('install-banner-dismiss');
  const installKey = 'bourbon-route:hide-install-banner';
  let hideBanner = false;
  try { hideBanner = localStorage.getItem(installKey) === '1'; } catch (_) {}
  const rememberHidden = () => {
    hideBanner = true;
    if (banner) banner.hidden = true;
    try { localStorage.setItem(installKey, '1'); } catch (_) {}
  };
  let checkingInstall = !hideBanner && !isInstalled() && typeof navigator.getInstalledRelatedApps === 'function';
  const refreshBanner = () => {
    if (banner) banner.hidden = checkingInstall || hideBanner || isInstalled();
    if (bannerAction) bannerAction.textContent = deferredPrompt ? 'Install app' : 'How to install';
  };
  if (help) help.hidden = true;
  if (apply) apply.hidden = true;
  if (install && isInstalled()) install.hidden = true;
  refreshBanner();
  if (checkingInstall) {
    const finishCheck = () => { checkingInstall = false; refreshBanner(); };
    const timer = setTimeout(finishCheck, 500);
    Promise.resolve().then(() => navigator.getInstalledRelatedApps()).then(apps => {
      relatedInstalled = apps.some(app => app.platform === 'webapp');
      if (relatedInstalled) {
        if (install) install.hidden = true;
        if (help) help.hidden = true;
      }
    }).catch(() => {}).finally(() => { clearTimeout(timer); finishCheck(); });
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredPrompt = event;
    if (install && !isInstalled()) { install.hidden = false; install.textContent = 'Install app'; }
    refreshBanner();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    rememberHidden();
    if (install) install.hidden = true;
    if (help) help.hidden = true;
  });
  function showInstallHelp(container, message, trigger) {
    const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    say(message, appleMobile
      ? 'In Safari, tap Share, then Add to Home Screen. If shown, leave Open as Web App on, then tap Add.'
      : 'In your browser menu, look for Install app or Add to Home Screen. You can keep using the site without installing.');
    if (container) container.hidden = false;
    if (trigger === bannerAction) trigger.setAttribute('aria-expanded', 'true');
  }
  async function requestInstall(container, message, trigger) {
    if (isInstalled()) { refreshBanner(); return; }
    if (!deferredPrompt) { showInstallHelp(container, message, trigger); return; }
    const prompt = deferredPrompt;
    deferredPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        rememberHidden();
        if (install) install.hidden = true;
        if (help) help.hidden = true;
      }
    } catch (_) {
      showInstallHelp(container, message, trigger);
    } finally {
      refreshBanner();
    }
  }
  if (bannerAction) bannerAction.addEventListener('click', () => requestInstall(bannerHelp, bannerHelp, bannerAction));
  if (bannerDismiss) bannerDismiss.addEventListener('click', () => {
    rememberHidden();
    const activeNav = document.querySelector('#nav button.active');
    if (activeNav) activeNav.focus();
  });
  if (install) install.addEventListener('click', () => requestInstall(help, byId('install-help-text'), install));
  const dismiss = byId('dismiss-install-help');
  if (dismiss) dismiss.addEventListener('click', () => { if (help) help.hidden = true; });
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
