/*
  Kanha Ji's Courtyard — installed-app mode

  The installed PWA enters through courtyard-app.html, which sets a
  session-only flag before loading index.html.

  This file intentionally does NOT set the document/body width and does NOT
  use visualViewport.width. Chrome Desktop Site can expose a wide layout
  viewport; the app CSS handles that by applying the existing mobile layout
  unconditionally.
*/
(function () {
  'use strict';

  var APP_MODE_KEY = 'courtyardAppMode';
  var isAppMode = false;

  try {
    var params = new URLSearchParams(window.location.search);
    isAppMode = params.get('app') === '1';

    if (isAppMode) {
      try { sessionStorage.setItem(APP_MODE_KEY, '1'); } catch (e) {}
    } else {
      try { isAppMode = sessionStorage.getItem(APP_MODE_KEY) === '1'; } catch (e) {}
    }
  } catch (e) {}

  if (!isAppMode) return;

  document.documentElement.classList.add('courtyard-app-mode');

  /*
    Keep the normal device-width viewport declaration. Never replace it with
    visualViewport.width, because that creates a narrow logical document
    which Chrome then scales down when Desktop Site is enabled.
  */
  try {
    var viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
      );
    }
  } catch (e) {}
})();
