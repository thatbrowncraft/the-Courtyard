/*
  Kanha Ji's Courtyard — installed-app presentation controller

  The normal website is untouched.
  The installed PWA enters through courtyard-app.html, which sets a
  session-only app flag before handing the page to index.html.

  This file also bridges Chrome's Desktop-site layout viewport problem:
  CSS cannot reliably read the physical/visual phone width when Chrome
  reports a wide layout viewport, so JS exposes visualViewport.width as
  --courtyard-app-width for the app-only CSS layer.
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

  var root = document.documentElement;
  root.classList.add('courtyard-app-mode');

  function updateViewportBridge() {
    try {
      var vv = window.visualViewport;
      var width = vv && isFinite(vv.width) ? vv.width : 0;

      if (width >= 280 && width <= 700) {
        root.style.setProperty('--courtyard-app-width', Math.round(width) + 'px');
      } else {
        var sw = Math.min(window.screen.width || 0, window.screen.height || 0);
        if (sw >= 280 && sw <= 700) {
          root.style.setProperty('--courtyard-app-width', Math.round(sw) + 'px');
        }
      }
    } catch (e) {}
  }

  try {
    var viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
      );
    }
  } catch (e) {}

  updateViewportBridge();

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportBridge, { passive: true });
    window.visualViewport.addEventListener('scroll', updateViewportBridge, { passive: true });
  }
  window.addEventListener('resize', updateViewportBridge, { passive: true });
})();
