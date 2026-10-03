'use strict';
(async () => {
  try {
    S.business = (await api('GET', '/public')).business_name;
    document.title = S.business;
  } catch {}
  // Without a saved login code there is nothing to load: straight to the login screen.
  if (session.get()) {
    try {
      await loadBoot();
    } catch {
      S.user = null;
    }
  }
  render();
  pollAlerts();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
