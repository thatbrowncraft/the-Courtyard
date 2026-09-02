/*
  Kanha Ji's Courtyard — installed-app mode flag
  =================================================
  This file's only job is deciding whether the page was opened as the
  installed PWA (start_url carries ?app=1) or as the normal website, and
  adding a stable html.courtyard-app-mode class in the first case.

  Deliberately does NOT use navigator.userAgent, pointer/hover media
  queries, or screen-width guessing — those are exactly what proved
  unreliable for telling the installed app apart from Chrome's
  "Desktop site" rendering of the same page. The explicit ?app=1 flag on
  the installed app's start_url is the only signal used.

  When the flag is absent (the normal website), this file does nothing at
  all — no class, no DOM changes, no side effects — and courtyard-app.css
  has nothing to match against, so the website is unaffected by any of
  this. Loaded and runs before app.js; touches nothing app.js owns.
*/
(function () {
  'use strict';

  var APP_MODE_KEY = 'courtyardAppMode';
  var isAppMode = false;

  try {
    var params = new URLSearchParams(window.location.search);
    isAppMode = params.get('app') === '1';

    if (isAppMode) {
      // Persist for this tab/session only, so if the SPA ever reloads or
      // navigates in a way that drops the query string mid-session, the
      // installed app doesn't fall back to the website presentation.
      try { sessionStorage.setItem(APP_MODE_KEY, '1'); } catch (e) { /* ignore */ }
    } else {
      try { isAppMode = sessionStorage.getItem(APP_MODE_KEY) === '1'; } catch (e) { /* ignore */ }
    }
  } catch (e) {
    isAppMode = false;
  }

  if (!isAppMode) return; // normal website: safely do nothing

  document.documentElement.classList.add('courtyard-app-mode');

  // Chrome can carry a per-origin "Desktop site" preference into the
  // installed, standalone-display PWA, which forces a wide layout
  // viewport regardless of this page's own <meta name="viewport"> tag.
  // Re-writing that tag's content after the override has already applied
  // gets Chrome to recompute the layout viewport against the real device
  // width. This is a no-op with no visible effect whenever Desktop-site
  // isn't active, and courtyard-app.css's unconditional width guard is
  // the real guarantee either way.
  try {
    var viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
      );
    }
  } catch (e) { /* ignore */ }
})();
