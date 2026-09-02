/*
  Kanha Ji's Courtyard — installed-app mode marker.

  The CSS presentation layer uses the standards-based (display-mode: standalone)
  media feature directly, so mobile presentation does not depend on JavaScript.
  This script only adds a class for a stable app-mode hook and preserves the
  session flag used by the dedicated PWA launcher.
*/
(function () {
  'use strict';

  var standalone = false;

  try {
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  } catch (e) {}

  var appMode = standalone;

  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('app') === '1') {
      appMode = true;
      try { sessionStorage.setItem('courtyardAppMode', '1'); } catch (e) {}
    } else if (!appMode) {
      try { appMode = sessionStorage.getItem('courtyardAppMode') === '1'; } catch (e) {}
    }
  } catch (e) {}

  if (appMode) {
    document.documentElement.classList.add('courtyard-app-mode');
  }
})();
