/* Kanha Ji's Courtyard — installed PWA presentation mode.
   Normal website mode is untouched.

   Chrome Desktop Site can expose a wide CSS layout viewport while the
   actual standalone phone window is narrower. In that case we use the
   visual viewport as the app's logical width and apply the inverse CSS
   zoom. This makes the existing mobile rules fill the physical phone
   instead of appearing as a narrow column. */
(function () {
  'use strict';

  var isAppMode = false;
  try {
    var params = new URLSearchParams(window.location.search);
    isAppMode = params.get('app') === '1';
    if (isAppMode) {
      try { sessionStorage.setItem('courtyardAppMode', '1'); } catch (e) {}
    } else {
      try { isAppMode = sessionStorage.getItem('courtyardAppMode') === '1'; } catch (e) {}
    }
  } catch (e) {}

  if (!isAppMode) return;

  var root = document.documentElement;
  root.classList.add('courtyard-app-mode');

  function updateViewportBridge() {
    try {
      var layoutWidth = window.innerWidth || root.clientWidth || 0;
      var vv = window.visualViewport;
      var visualWidth = vv && isFinite(vv.width) ? vv.width : layoutWidth;

      if (layoutWidth >= 700 && visualWidth >= 280 && visualWidth < layoutWidth * 0.85) {
        var zoom = layoutWidth / visualWidth;
        root.style.setProperty('--courtyard-app-width', visualWidth + 'px');
        root.style.setProperty('--courtyard-app-zoom', String(Math.min(Math.max(zoom, 1), 3)));
        root.classList.add('courtyard-wide-viewport');
      } else {
        root.style.setProperty('--courtyard-app-width', '100%');
        root.style.setProperty('--courtyard-app-zoom', '1');
        root.classList.remove('courtyard-wide-viewport');
      }
    } catch (e) {}
  }

  try {
    var viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) viewportMeta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
    );
  } catch (e) {}

  updateViewportBridge();
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateViewportBridge, { passive: true });
  window.addEventListener('resize', updateViewportBridge, { passive: true });
})();
