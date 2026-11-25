/* Install guidance, verified offline readiness and opt-in updates. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const install = byId('install-app'), check = byId('offline-check');
  const gear = byId('open-settings'), settings = byId('road-settings');
  const updateBanner = byId('update-banner'), updateAction = byId('banner-update');
  const bannerUpdateStatus = byId('banner-update-status'), settingsUpdate = byId('check-update');
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
  const sw = navigator.serviceWorker;
  let dismissedUpdate = false, checking = false, checkPromise, installTimer, wasHidden = false;
  const waiting = () => !!registration?.waiting;
  const hasUpdate = () => !!sw?.controller && waiting();
  const note = text => {
    say(update, text);
    say(bannerUpdateStatus, text);
    if (bannerUpdateStatus) bannerUpdateStatus.hidden = !text;
  };
  function paintUpdate() {
    const ready = hasUpdate();
    if (updateBanner) updateBanner.hidden = dismissedUpdate || !ready;
    if (settingsUpdate) {
      settingsUpdate.textContent = reloadRequested ? 'Installing…' : ready ? 'Install update' : checking ? 'Checking…' : 'Check for update';
      settingsUpdate.disabled = reloadRequested || checking || !sw || !registration;
    }
    if (updateAction) updateAction.disabled = reloadRequested || !ready;
    if (ready && !reloadRequested && (!update.textContent || /Checking|latest version|still downloading/.test(update.textContent))) {
      say(update, 'An update is ready to install.');
    }
  }
  function checkUpdates(report = false) {
    if (!sw || !registration) { if (report) say(update, !sw ? 'Updates are not supported in this browser.' : 'Update service is not ready yet. Try again shortly.'); return Promise.resolve(); }
    if (hasUpdate()) { paintUpdate(); return Promise.resolve(); }
    if (navigator.onLine === false) { if (report) say(update, 'Connect to the internet to check for updates.'); return Promise.resolve(); }
    if (checkPromise) return checkPromise;
    checking = true;
    if (report) say(update, 'Checking for an update…');
    paintUpdate();
    checkPromise = Promise.resolve().then(() => registration.update()).then(() => {
      if (hasUpdate()) say(update, 'An update is ready to install.');
      else if (report) say(update, registration.installing && sw.controller ? 'An update is still downloading…' : 'You’re on the latest version.');
    }).catch(() => {
      if (report) say(update, 'Could not check for updates. Check your connection and try again.');
    }).finally(() => { checking = false; checkPromise = null; paintUpdate(); });
    return checkPromise;
  }
  function installUpdate() {
    if (reloadRequested || !hasUpdate()) { paintUpdate(); return; }
    reloadRequested = true;
    note('Installing update…');
    paintUpdate();
    try {
      registration.waiting.postMessage({type: 'SKIP_WAITING'});
      installTimer = setTimeout(() => {
        reloadRequested = false;
        note('The update didn’t finish. Try installing it again in Settings.');
        paintUpdate();
      }, 12000);
    } catch (_) {
      reloadRequested = false;
      note('Could not install the update. Try again in Settings.');
      paintUpdate();
    }
  }
  gear?.addEventListener('click', () => {
    if (!settings.open) settings.showModal();
    paintUpdate();
  });
  settings?.addEventListener('close', () => gear?.focus());
  byId('dismiss-update')?.addEventListener('click', () => {
    dismissedUpdate = true;
    paintUpdate();
    gear?.focus();
  });
  settingsUpdate?.addEventListener('click', () => hasUpdate() ? installUpdate() : checkUpdates(true));
  updateAction?.addEventListener('click', installUpdate);
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
  check?.addEventListener('click', readiness);
  function watchInstallation(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') { paintUpdate(); readiness(); }
      else if (worker.state === 'redundant') { if (!hasUpdate()) say(update, 'The update could not download. Try checking again.'); paintUpdate(); }
    });
  }
  if (sw) {
    let alreadyControlled = !!sw.controller;
    sw.addEventListener('controllerchange', () => {
      if (reloadRequested) { clearTimeout(installTimer); location.reload(); }
      else if (sw.controller) {
        if (alreadyControlled) note('Update installed. Reopen the app to load the new version.');
        alreadyControlled = true; paintUpdate(); readiness();
      }
    });
    sw.register('./sw.js', {updateViaCache: 'none'}).then(reg => {
      registration = reg;
      watchInstallation(reg.installing);
      reg.addEventListener('updatefound', () => watchInstallation(reg.installing));
      paintUpdate(); readiness(); checkUpdates();
    }).catch(() => {
      if (settingsUpdate) settingsUpdate.disabled = true;
      say(update, 'Update service is unavailable. Reconnect and reload the page.');
      say(offline, 'Offline setup failed. The online site still works.');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { wasHidden = true; return; }
      if (!wasHidden) return;
      wasHidden = false;
      if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) dismissedUpdate = false;
      paintUpdate(); checkUpdates();
    });
    window.addEventListener('pageshow', event => {
      if (event.persisted) { dismissedUpdate = false; paintUpdate(); checkUpdates(); }
    });
  } else {
    paintUpdate(); readiness();
    say(update, 'Updates are not supported in this browser.');
  }
  window.addEventListener('online', () => { readiness(); checkUpdates(); });
  window.addEventListener('offline', readiness);
})();
