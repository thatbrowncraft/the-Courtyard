/*
  Kanha Ji's Courtyard — TEMPORARY diagnostic overlay (PHASE 1 ONLY)
  =====================================================================
  Purpose: measure exactly what the installed PWA is receiving from
  Chrome — standalone state, app-mode detection, screen vs. layout vs.
  visual viewport, viewport meta, device pixel ratio, touch points —
  so the five candidate causes (A–E) can be told apart with real
  numbers instead of guesses.

  This file does NOT:
    - modify the viewport meta tag
    - modify any CSS, layout, width, or theme
    - apply zoom or transform
    - change font sizes
    - touch service-worker.js or caching behavior
    - change any existing markup, only appends its own new element

  It only reads values and renders a small fixed-position report panel.
  The panel appears ONLY when the page is actually running standalone
  (installed PWA) — checked independently of this app's own
  courtyard-app-mode class, since whether that class gets set correctly
  is one of the things being diagnosed here.

  TO REMOVE AFTER PHASE 1: delete this file and the one
  <script src="courtyard-diagnostics.js" defer></script> line near the
  end of index.html. Nothing else references it.
*/
(function () {
  'use strict';

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) { /* ignore */ }
    if (window.navigator && window.navigator.standalone === true) return true;
    return false;
  }

  // Normal website tab (installed-app or not): do nothing at all.
  if (!isStandalone()) return;

  function safe(fn, fallback) {
    try {
      var v = fn();
      return (v === undefined) ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function fmt(v) {
    return (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))) ? 'n/a' : String(v);
  }

  // Mirrors courtyard-app.js's own detection logic exactly (URL ?app=1,
  // falling back to the sessionStorage flag it sets) — computed fresh
  // here, independently of whatever class is or isn't currently on
  // <html>, so a failure in that logic is visible even if the class
  // never got applied.
  function computeAppModeFlag() {
    var urlFlag = safe(function () {
      return new URLSearchParams(window.location.search).get('app') === '1';
    }, false);
    if (urlFlag) return true;
    return safe(function () { return sessionStorage.getItem('courtyardAppMode') === '1'; }, false);
  }

  function buildReport() {
    var vv = window.visualViewport;
    var html = document.documentElement;

    var standaloneMQ = safe(function () { return window.matchMedia('(display-mode: standalone)').matches; }, null);
    var navStandalone = safe(function () { return window.navigator.standalone; }, undefined);
    var appModeFlag = computeAppModeFlag();
    var appModeClass = html.classList.contains('courtyard-app-mode');
    var mobileDeviceClass = html.classList.contains('courtyard-mobile-device');

    var screenW = safe(function () { return window.screen.width; }, null);
    var screenH = safe(function () { return window.screen.height; }, null);
    var innerW = safe(function () { return window.innerWidth; }, null);
    var innerH = safe(function () { return window.innerHeight; }, null);
    var clientW = safe(function () { return html.clientWidth; }, null);
    var clientH = safe(function () { return html.clientHeight; }, null);
    var vvW = vv ? safe(function () { return vv.width; }, null) : null;
    var vvH = vv ? safe(function () { return vv.height; }, null) : null;
    var dpr = safe(function () { return window.devicePixelRatio; }, null);
    var touchPoints = safe(function () { return navigator.maxTouchPoints; }, null);
    var ua = safe(function () { return navigator.userAgent; }, '');
    var uaShort = ua.length > 90 ? ua.slice(0, 90) + '…' : ua;

    var meta = document.querySelector('meta[name="viewport"]');
    var viewportContent = meta ? meta.getAttribute('content') : 'no <meta name="viewport"> found';

    var maxWidth720MQ = safe(function () { return window.matchMedia('(max-width: 720px)').matches; }, null);
    // The exact compound media query styles.css itself uses to activate
    // its mobile safety layer, run verbatim — reports reality rather
    // than an approximation of it.
    var mobileSafetyLayerMQ = safe(function () {
      return window.matchMedia(
        '(max-width: 720px), (pointer: coarse) and (hover: none) and (min-width: 721px) and (max-width: 1100px), (display-mode: standalone)'
      ).matches;
    }, null);

    var href = safe(function () { return window.location.href; }, '');
    var appParam = safe(function () { return new URLSearchParams(window.location.search).get('app'); }, null);
    var sessionFlag = safe(function () { return sessionStorage.getItem('courtyardAppMode'); }, null);

    // Desktop-site viewport mismatch heuristic — flagged only when the
    // layout viewport (innerWidth) is dramatically wider than the real
    // screen width AND the visual viewport (when available) still
    // tracks the real screen width. The raw numbers below are what
    // actually matter; this is just a threshold-based hint, not a
    // conclusion.
    var mismatch = 'n/a (screen.width unavailable)';
    var mismatchDetail = 'n/a';
    if (typeof screenW === 'number' && screenW > 0 && typeof innerW === 'number') {
      var ratio = innerW / screenW;
      var visualTracksScreen = (vvW == null) ? null : (Math.abs(vvW - screenW) / screenW < 0.2);
      mismatch = (ratio > 1.3 && visualTracksScreen !== false) ? 'YES' : 'NO';
      mismatchDetail = 'innerWidth/screen.width = ' + ratio.toFixed(2) +
        (vvW != null
          ? ', visualViewport within 20% of screen.width: ' + (visualTracksScreen ? 'YES' : 'NO')
          : ', visualViewport not available');
    }

    return [
      ['Standalone', standaloneMQ === null ? 'n/a' : (standaloneMQ ? 'YES' : 'NO')],
      ['navigator.standalone', navStandalone === undefined ? 'not available (non-iOS)' : String(navStandalone)],
      ['App mode (computed: URL ?app=1 / sessionStorage)', appModeFlag ? 'YES' : 'NO'],
      ['courtyard-app-mode class on <html>', appModeClass ? 'YES' : 'NO'],
      ['courtyard-mobile-device class on <html>', mobileDeviceClass ? 'YES' : 'NO'],
      ['screen.width', fmt(screenW)],
      ['screen.height', fmt(screenH)],
      ['window.innerWidth', fmt(innerW)],
      ['window.innerHeight', fmt(innerH)],
      ['document.documentElement.clientWidth', fmt(clientW)],
      ['document.documentElement.clientHeight', fmt(clientH)],
      ['visualViewport.width', vv ? fmt(vvW) : 'Not available'],
      ['visualViewport.height', vv ? fmt(vvH) : 'Not available'],
      ['devicePixelRatio', fmt(dpr)],
      ['navigator.maxTouchPoints', fmt(touchPoints)],
      ['Viewport meta content', viewportContent],
      ['matchMedia (max-width: 720px)', maxWidth720MQ === null ? 'n/a' : (maxWidth720MQ ? 'YES' : 'NO')],
      ['Mobile safety-layer query (styles.css, verbatim)', mobileSafetyLayerMQ === null ? 'n/a' : (mobileSafetyLayerMQ ? 'YES — active' : 'NO — not active')],
      ['Desktop-site viewport mismatch', mismatch],
      ['  (mismatch detail)', mismatchDetail],
      ['Launch URL', href],
      ['URL ?app= param', appParam === null ? '(none)' : appParam],
      ['sessionStorage courtyardAppMode', sessionFlag === null ? '(none)' : sessionFlag],
      ['User agent', uaShort]
    ];
  }

  function render() {
    var existing = document.getElementById('courtyardDiag');
    if (existing) existing.remove();

    var lines = buildReport();

    var panel = document.createElement('div');
    panel.id = 'courtyardDiag';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Courtyard PWA diagnostics');
    panel.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'max-height:70vh',
      'overflow:auto', 'background:rgba(10,10,12,0.97)', 'color:#E9E9E9',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'font-size:11px', 'line-height:1.5', 'padding:12px 12px 16px',
      'z-index:2147483647', 'box-sizing:border-box',
      'border-top:2px solid #E0AE64', '-webkit-text-size-adjust:100%'
    ].join(';');

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;';

    var title = document.createElement('strong');
    title.textContent = 'COURTYARD PWA DIAGNOSTICS';
    title.style.cssText = 'font-size:12px;letter-spacing:0.04em;color:#E0AE64;';
    header.appendChild(title);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex:0 0 auto;';

    function makeBtn(label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'font:inherit;font-size:11px;padding:5px 10px;background:#222;color:#fff;border:1px solid #555;cursor:pointer;';
      return b;
    }

    var copyBtn = makeBtn('Copy');
    copyBtn.addEventListener('click', function () {
      var text = lines.map(function (l) { return l[0] + ': ' + l[1]; }).join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = 'Copied!';
          setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(function () { copyBtn.textContent = 'Copy failed'; });
      } else {
        copyBtn.textContent = 'Clipboard n/a';
      }
    });

    var closeBtn = makeBtn('Close \u2715');
    closeBtn.addEventListener('click', function () { panel.remove(); });

    btnRow.appendChild(copyBtn);
    btnRow.appendChild(closeBtn);
    header.appendChild(btnRow);
    panel.appendChild(header);

    var table = document.createElement('div');
    lines.forEach(function (pair) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.08);word-break:break-all;';
      var k = document.createElement('span');
      k.textContent = pair[0] + ':';
      k.style.cssText = 'flex:0 0 auto;color:#9AD1B3;min-width:150px;';
      var v = document.createElement('span');
      v.textContent = pair[1];
      v.style.cssText = 'flex:1 1 auto;color:#fff;';
      row.appendChild(k);
      row.appendChild(v);
      table.appendChild(row);
    });
    panel.appendChild(table);

    document.body.appendChild(panel);
  }

  function init() {
    render();
    // Re-render on resize/orientation change so toggling Chrome's
    // "Desktop site" setting (where it triggers a resize) updates the
    // numbers without needing a full reload.
    window.addEventListener('resize', render);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', render);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
