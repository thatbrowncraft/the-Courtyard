(function(){
  'use strict';

  /* ---------------- storage layer ----------------
     Falls back to in-memory state automatically if localStorage
     is unavailable (e.g. inside Claude.ai's artifact preview sandbox).
     When this file is opened normally in a browser via a local
     server, real localStorage kicks in and entries persist. */
  const memoryStore = {};
  const Storage = {
    available: (function(){
      try{ const k='__t'; localStorage.setItem(k,'1'); localStorage.removeItem(k); return true; }
      catch(e){ return false; }
    })(),
    get(key, fallback){
      if(this.available){
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      }
      return memoryStore[key] !== undefined ? memoryStore[key] : fallback;
    },
    set(key, value){
      if(this.available){ localStorage.setItem(key, JSON.stringify(value)); }
      else{ memoryStore[key] = value; }
    }
  };

  /* ---------------- placeholder data ---------------- */
  const EMOTIONS = [
    { id:'overwhelmed', label:"I'm overwhelmed", response:"Set down what you're carrying, even for a minute. Nothing here needs finishing today." },
    { id:'peace', label:'I need peace', response:'Slow is allowed. Stay as long as it takes for your shoulders to drop.' },
    { id:'anxious', label:"I'm anxious", response:"You don't have to solve anything right now. Just be here for a moment." },
    { id:'angry', label:"I'm angry", response:'That heat is real. Let it exist here without needing to justify it.' },
    { id:'lost', label:'I feel lost', response:"Not knowing the way isn't the same as being wrong. Rest here a while." },
    { id:'read', label:'I simply want to read', response:'No feeling required. Come in and read at your own pace.' }
  ];

  /* ---------------- app configuration & content (data-driven) ----------------
     CONFIG mirrors config.json. data/chapters.json is a plain filename
     manifest — an ordered array of strings like "chapter-01.json" — not a
     metadata file. It only tells us how many chapters exist, their order,
     and their numbers. Every other fact about a chapter (title, subtitle,
     verse count) lives inside that chapter's own file, shaped as
     { id, title, subtitle, verses: [...] }, and is derived from it the
     first time that chapter is actually needed. CHAPTERS below is Claude's
     in-memory metadata cache, built from the manifest and progressively
     filled in as each chapter file is fetched — it is never itself fetched
     or overwritten wholesale from disk. Adding a new chapter never requires
     touching this file: add data/chapter-NN.json (with its own id/title/
     subtitle/verses) and list its filename in data/chapters.json. */
  let CONFIG = {
    version: '2.0.0',
    appTitle: "Kanha Ji's Courtyard",
    defaultTheme: 'dusk',
    defaultAmbience: null,
    reducedMotionDefault: false,
    defaultVolume: 0.5
  };
  // Fallback manifest used only if data/chapters.json can't be fetched
  // (e.g. opened without a local server) — same 18-chapter shape either way.
  let CHAPTER_FILES = Array.from({length:18}, (_,i)=>`chapter-${String(i+1).padStart(2,'0')}.json`);
  // CHAPTERS holds one metadata placeholder per manifest entry. title/
  // subtitle/verseCount are null until that chapter's own file has been
  // fetched at least once; renderChapters() shows a quiet placeholder for
  // whatever isn't loaded yet rather than treating null as "unwritten."
  let CHAPTERS = [];
  let VERSES_BY_CHAPTER = {};
  // Tracks in-flight fetches per chapter number so a chapter is never
  // requested twice at once (e.g. a fast double-click, or a prefetch
  // racing a real open of the same chapter).
  let chapterLoadPromises = {};

  function chapterNumberFromFile(filename){
    const m = /(\d+)/.exec(filename);
    return m ? Number(m[1]) : null;
  }

  function buildChaptersFromManifest(files){
    CHAPTERS = files.map((file, i) => {
      const number = chapterNumberFromFile(file) || (i + 1);
      return { number, file, title: null, subtitle: null, verseCount: null };
    });
  }

  async function fetchJSON(path){
    const res = await fetch(path);
    if(!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.json();
  }

  /* Startup only loads config.json and the lightweight filename manifest —
     never the ~700-verse body of the Gita. Individual chapters (title,
     subtitle, and verses together) are fetched on demand by
     loadChapterVerses() below, the first time they're actually needed. */
  async function loadContent(){
    try{
      const config = await fetchJSON('config.json');
      CONFIG = Object.assign({}, CONFIG, config);
    }catch(e){ /* keep fallback CONFIG */ }

    if(CONFIG.appTitle) document.title = CONFIG.appTitle;

    try{
      const manifest = await fetchJSON('data/chapters.json');
      if(Array.isArray(manifest) && manifest.length) CHAPTER_FILES = manifest;
    }catch(e){ /* keep fallback CHAPTER_FILES */ }

    buildChaptersFromManifest(CHAPTER_FILES);

    try{
      const ambienceManifest = await fetchJSON('assets/audio/audio.json');
      if(Array.isArray(ambienceManifest) && ambienceManifest.length) AMBIENCE_LIST = ambienceManifest;
    }catch(e){ /* keep fallback AMBIENCE_LIST */ }

    buildAmbienceSources(AMBIENCE_LIST);
  }

  function getVersesForChapter(chapterNumber){
    return VERSES_BY_CHAPTER[chapterNumber] || [];
  }

  /* Fetches a chapter's own file the first time that chapter is needed —
     data/chapter-NN.json, shaped { id, title, subtitle, verses: [...] } —
     and caches the verses in VERSES_BY_CHAPTER so reopening it is instant
     and never re-fetched. The same fetch also fills in that chapter's
     title/subtitle/verseCount on its CHAPTERS entry, since the manifest
     never carried that metadata. Concurrent requests for the same chapter
     (e.g. a real open racing a background prefetch) share the same
     in-flight promise instead of firing a duplicate request. A chapter
     that hasn't been written yet (missing file, or a file with an empty
     verses array) resolves to an empty array; only a genuine fetch/parse
     failure is left uncached so it can be retried later. */
  async function loadChapterVerses(chapterNumber){
    if(VERSES_BY_CHAPTER[chapterNumber]) return VERSES_BY_CHAPTER[chapterNumber];
    if(chapterLoadPromises[chapterNumber]) return chapterLoadPromises[chapterNumber];

    const ch = CHAPTERS.find(c => c.number === chapterNumber);
    if(!ch) return [];

    const promise = (async ()=>{
      try{
        const data = await fetchJSON(`data/${ch.file}`);
        const verses = Array.isArray(data && data.verses) ? data.verses : [];
        ch.title = data.title || ch.title || `Chapter ${chapterNumber}`;
        ch.subtitle = data.subtitle || ch.subtitle || '';
        ch.verseCount = verses.length;
        VERSES_BY_CHAPTER[chapterNumber] = verses;
        return verses;
      }catch(e){ /* falls back to "hasn't been written yet" empty state */ }
      return [];
    })();

    chapterLoadPromises[chapterNumber] = promise;
    try{
      return await promise;
    } finally {
      delete chapterLoadPromises[chapterNumber];
    }
  }

  /* Quietly warms the next chapter in the background once the current one
     has finished loading — never the whole scripture, just one chapter
     ahead, and only if it isn't already cached or already loading. Whether
     that next chapter has real verses isn't known until it's fetched, so
     this only skips chapters that are already loaded/loading, not ones
     that merely look "empty" — the fetch itself resolves to [] harmlessly
     for a chapter that hasn't been written yet. */
  function prefetchNextChapter(chapterNumber){
    const next = chapterNumber + 1;
    const ch = CHAPTERS.find(c => c.number === next);
    if(!ch) return;
    if(VERSES_BY_CHAPTER[next] || chapterLoadPromises[next]) return;
    loadChapterVerses(next).catch(()=>{});
  }

  /* ---------------- arrival ritual ----------------
     First visit: the full choreographed sequence.
     Returning visits (within 7 days): fade straight into the homepage instead.
     After 7 days, or from Settings → "Replay the welcome": the full ritual again. */
  function runArrival(force){
    const arrival = document.getElementById('arrival');
    if(!arrival) return;
    const reduce = Storage.get('reduceMotion', CONFIG.reducedMotionDefault) || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if(reduce){
      arrival.style.display = 'none';
      return;
    }
    const lastShown = Storage.get('lastArrivalShown', null);
    const daysSince = lastShown ? (Date.now() - lastShown) / 86400000 : Infinity;
    const fullRitual = force || daysSince >= 7;

    // reset any previous run so it can be replayed cleanly
    arrival.style.display = 'flex';
    arrival.classList.remove('arrival-done', 'quick');
    document.getElementById('arrivalDust').innerHTML = '';
    document.getElementById('arrivalDust').classList.remove('a-visible');
    document.getElementById('arrivalMist').classList.remove('a-visible');
    document.getElementById('arrivalFeather').classList.remove('a-fly');
    document.getElementById('arrivalTitle').classList.remove('a-visible', 'a-tagline');
    document.getElementById('arrivalDiya').classList.remove('a-lit', 'a-finishing');
    document.body.classList.add('arrival-active');

    if(!fullRitual){
      // a returning visit — no ritual, just a quiet dissolve into the homepage already underneath
      arrival.classList.add('quick');
      requestAnimationFrame(()=>{
        arrival.classList.add('arrival-done');
        document.body.classList.remove('arrival-active');
      });
      setTimeout(()=>{ arrival.style.display = 'none'; }, 800);
      Storage.set('lastArrivalShown', Date.now());
      return;
    }

    let timers = [];
    function schedule(fn, ms){ timers.push(setTimeout(fn, ms)); }

    schedule(()=> document.getElementById('arrivalDiya').classList.add('a-lit'), 700);
    schedule(spawnArrivalDust, 1500);
    schedule(()=> document.getElementById('arrivalMist').classList.add('a-visible'), 1900);
    schedule(()=> document.getElementById('arrivalFeather').classList.add('a-fly'), 2600);
    schedule(()=> document.getElementById('arrivalTitle').classList.add('a-visible'), 3800);
    schedule(()=> document.getElementById('arrivalTitle').classList.add('a-tagline'), 4600);
    schedule(finish, 6700);

    function finish(){
      timers.forEach(clearTimeout);
      // the glow itself opens the space, rather than the interface simply fading in behind it
      document.getElementById('arrivalDiya').classList.add('a-finishing');
      // the corner diya (already quietly lit this whole time, just hidden behind the overlay)
      // catches a little brighter right as the arrival flame arrives, like the same fire settling in
      const cornerFlame = document.querySelector('#diya .flame');
      if(cornerFlame){
        cornerFlame.classList.add('flame-strong');
        setTimeout(()=> cornerFlame.classList.remove('flame-strong'), 2000);
      }
      setTimeout(()=>{
        arrival.classList.add('arrival-done');
        document.body.classList.remove('arrival-active');
      }, 260);
      setTimeout(()=>{ arrival.style.display = 'none'; }, 2900);
      arrival.removeEventListener('click', finish);
      document.removeEventListener('keydown', finish);
      Storage.set('lastArrivalShown', Date.now());
    }
    arrival.addEventListener('click', finish, {once:true});
    document.addEventListener('keydown', finish, {once:true});
  }

  function spawnArrivalDust(){
    const wrap = document.getElementById('arrivalDust');
    wrap.classList.add('a-visible');
    for(let i=0;i<11;i++){
      const m = document.createElement('div');
      m.className = 'a-mote';
      m.style.left = (28+Math.random()*44)+'%';
      m.style.top = (38+Math.random()*32)+'%';
      m.style.animationDuration = (4+Math.random()*4)+'s';
      m.style.animationDelay = (Math.random()*3)+'s';
      wrap.appendChild(m);
    }
  }

  /* ---------------- stars ---------------- */
  function initStars(){
    const wrap = document.getElementById('stars');
    wrap.innerHTML = '';
    for(let i=0;i<26;i++){
      const s = document.createElement('div');
      s.className = 'star';
      const size = Math.random() < 0.25 ? 1.6 : 1;
      s.style.width = size+'px'; s.style.height = size+'px';
      s.style.left = Math.random()*100+'vw';
      s.style.top = Math.random()*70+'vh';
      s.style.animationDuration = (4+Math.random()*6)+'s';
      s.style.animationDelay = (Math.random()*6)+'s';
      wrap.appendChild(s);
    }
  }

  /* ---------------- desynchronized, non-identical timing for the fixed single-instance
     animations (the flame, the feather, the fog, the bells...) ----------------
     Without this every one of these starts its keyframe loop in lock-step and
     repeats an identical-length cycle forever, which is what reads as "mechanical."
     A small random duration jitter plus a random negative delay (so each element
     appears to already be mid-cycle rather than starting fresh) is enough to break
     that without touching what any of them actually look like. */
  function humanizeTimings(){
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    function jitter(el, baseSeconds, spread){
      if(!el) return;
      const dur = baseSeconds * (1 + (Math.random()*2 - 1) * spread);
      el.style.animationDuration = dur.toFixed(2) + 's';
      el.style.animationDelay = (-Math.random() * baseSeconds).toFixed(2) + 's';
    }
    jitter(document.querySelector('#diya .flame'), 3, 0.12);
    jitter(document.querySelector('.kj-feather'), 9, 0.12);
    jitter(document.querySelector('.fog'), 26, 0.1);
    jitter(document.getElementById('shadowDrift'), 37, 0.1);
    document.querySelectorAll('.hbell').forEach(b => jitter(b, 11, 0.18));
  }

  /* ---------------- ambient animation ---------------- */
  function initAmbient(){
    const layer = document.getElementById('ambient');
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)){ layer.innerHTML = ''; return; }
    layer.innerHTML = '';

    const fog = document.createElement('div');
    fog.className = 'fog';
    layer.appendChild(fog);

    for(let i=0;i<10;i++){
      const f = document.createElement('div');
      f.className = 'firefly';
      const startX = Math.random()*100;
      const startY = 60 + Math.random()*40;
      f.style.left = startX+'vw';
      f.style.top = startY+'vh';
      f.style.setProperty('--dx', (Math.random()*40-20)+'vw');
      f.style.setProperty('--dy', -(40+Math.random()*40)+'vh');
      f.style.animationDuration = (10+Math.random()*12)+'s, 4s';
      f.style.animationDelay = (Math.random()*10)+'s';
      layer.appendChild(f);
    }
    for(let i=0;i<8;i++){
      const p = document.createElement('div');
      p.className = 'petal';
      p.style.left = Math.random()*100+'vw';
      p.style.setProperty('--sway', (Math.random()*40-20)+'px');
      p.style.animationDuration = (18+Math.random()*14)+'s';
      p.style.animationDelay = (Math.random()*14)+'s';
      layer.appendChild(p);
    }
  }

  /* ---------------- occasional wandering feather ----------------
     The path is generated fresh each time as a chain of waypoints — random
     count, position, hold, and rotation — then eased between with plain CSS
     transitions of varying duration. That randomness (rather than a fixed
     keyframe table) is what makes it read as carried-by-air instead of an
     animation replaying: it can drift left or right, pause mid-flight as if
     the wind stopped, rotate, or rise a little before settling again, and no
     two passes trace the same curve. Its starting direction leans gently with
     the current --breeze reading, so it feels caught by the same air as
     everything else, without being locked to it. */
  let featherTimer = null;
  function scheduleFeather(){
    if(featherTimer) clearTimeout(featherTimer);
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    const delay = 90000 + Math.random()*90000; // roughly 1.5–3 minutes apart
    featherTimer = setTimeout(()=>{
      if(document.hidden){ scheduleFeather(); return; }
      flyFeatherProcedural();
      scheduleFeather();
    }, delay);
  }

  function flyFeatherProcedural(){
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    const f = document.getElementById('feather-wander');
    if(f.dataset.flying === '1') return; // never overlap a flight already in progress
    f.dataset.flying = '1';

    const breeze = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--breeze')) || 0;
    // mostly follows the current breeze direction, occasionally defies it
    const dir = (Math.random() < 0.78 ? (breeze >= 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1));
    const band = 4 + Math.random()*30; // vh — this flight's general altitude
    const legs = 3 + Math.floor(Math.random()*4); // 3–6 legs, different every time
    const startX = dir === 1 ? -8 : 108;
    const endX = dir === 1 ? 108 : -8;

    const waypoints = [{ x:startX, y:band, rot:(-10-Math.random()*8)*dir, hold:0, dur:0 }];
    for(let i=1;i<legs;i++){
      const p = i/legs;
      const x = startX + (endX-startX)*p + (Math.random()*10-5);
      const rise = Math.random() < 0.35; // sometimes climbs a little before continuing
      const pause = Math.random() < 0.3; // sometimes the wind seems to stop
      const y = Math.max(2, band + (Math.random()*22-11) - (rise ? 6+Math.random()*9 : 0));
      waypoints.push({
        x, y,
        rot: (Math.random()*22-11) * dir,
        hold: pause ? 350 + Math.random()*950 : 0,
        dur: 1700 + Math.random()*2400
      });
    }
    waypoints.push({ x:endX, y: band + (Math.random()*10-5), rot:(Math.random()*8-4)*dir, hold:0, dur:2000+Math.random()*1800 });

    const totalDuration = waypoints.reduce((sum,w)=> sum + w.dur + w.hold, 0);

    f.style.transition = 'none';
    f.style.opacity = '0';
    f.style.left = waypoints[0].x+'vw';
    f.style.top = waypoints[0].y+'vh';
    f.style.transform = `rotate(${waypoints[0].rot.toFixed(1)}deg)`;
    void f.offsetWidth;

    spawnFeatherTrail(f, totalDuration);

    let idx = 0;
    function step(){
      idx++;
      const done = idx >= waypoints.length;
      const wp = waypoints[Math.min(idx, waypoints.length-1)];
      const legDur = done ? 1200 : wp.dur;
      f.style.transition = `left ${wp.dur||legDur}ms ease-in-out, top ${wp.dur||legDur}ms ease-in-out, transform ${wp.dur||legDur}ms ease-in-out, opacity 1.1s ease`;
      if(done){
        f.style.opacity = '0';
        setTimeout(()=>{ f.dataset.flying = '0'; }, legDur + 100);
        return;
      }
      f.style.left = wp.x+'vw';
      f.style.top = wp.y+'vh';
      f.style.transform = `rotate(${wp.rot.toFixed(1)}deg)`;
      f.style.opacity = (idx === waypoints.length-1) ? '0' : String((0.26 + Math.random()*0.26).toFixed(2));
      setTimeout(step, wp.dur + wp.hold);
    }
    requestAnimationFrame(()=>{
      f.style.transition = 'opacity 1.1s ease';
      f.style.opacity = String((0.3 + Math.random()*0.2).toFixed(2));
      setTimeout(step, waypoints[1] ? 60 : 0);
    });
  }

  /* a few motes catching the diya-light as the feather passes — spawned rarely
     and unevenly (sometimes several, sometimes almost none), each with its own
     brief lifetime and size, so the trail never reads as a uniform sprinkle. */
  function spawnFeatherTrail(el, duration){
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    const start = performance.now();
    function tick(){
      if(document.hidden) return;
      const elapsed = performance.now() - start;
      if(elapsed > duration) return;
      // roughly a third of ticks actually spawn anything — "less is better"
      if(Math.random() < 0.34){
        const rect = el.getBoundingClientRect();
        if(rect.width){
          const size = 1.4 + Math.random()*2;
          const m = document.createElement('div');
          m.className = 'feather-trail-mote';
          m.style.width = size+'px';
          m.style.height = size+'px';
          m.style.left = (rect.left + rect.width*0.45) + 'px';
          m.style.top = (rect.top + rect.height*0.6) + 'px';
          m.style.setProperty('--tx', (Math.random()*16-8) + 'px');
          m.style.setProperty('--ty', (8+Math.random()*14) + 'px');
          const life = 1200 + Math.random()*1400;
          m.style.animationDuration = life+'ms';
          document.body.appendChild(m);
          setTimeout(()=> m.remove(), life);
        }
      }
      setTimeout(tick, 320 + Math.random()*420);
    }
    tick();
  }

  /* ---------------- one invisible breeze, felt by everything at once ----------------
     Two independent, incommensurate composite sines drive shared CSS variables:
     --breeze (the "wind direction", felt by the feather/flame/fog/particles as a
     lean) and --jitter (a slower, unrelated signal used only as tiny per-frame
     noise, so a flame or a feather never traces exactly the same curve twice —
     nature rather than a repeating CSS loop). Both are read by keyframes already
     in place, so no element's animation had to be redesigned to use them. */
  let breezeRAF = null, breezeT = 0, jitterT = 3.7;
  function breezeTick(){
    breezeT += 0.0055;
    jitterT += 0.0091;
    const breeze = Math.sin(breezeT) * 0.7 + Math.sin(breezeT * 0.43 + 1.3) * 0.4;
    const jitter = Math.sin(jitterT * 0.71 + 0.6) * 0.5 + Math.sin(jitterT * 1.9 + 2.1) * 0.3 + Math.sin(jitterT * 3.3) * 0.15;
    const glow = 0.5 + jitter * 0.3 + Math.sin(breezeT * 3.1) * 0.12; // a faint pulse the diya's nearby elements lean on, so the flame reads as their light source
    document.documentElement.style.setProperty('--breeze', breeze.toFixed(3));
    document.documentElement.style.setProperty('--jitter', jitter.toFixed(3));
    document.documentElement.style.setProperty('--diya-glow', glow.toFixed(3));
    const ambient = document.getElementById('ambient');
    if(ambient) ambient.style.transform = `translateX(${(breeze * 2.2 + jitter * 0.6).toFixed(2)}px)`;
    const banyan = document.getElementById('banyan');
    if(banyan) banyan.style.transform = `translateX(${(breeze * 1.5).toFixed(2)}px)`;
    const stars = document.getElementById('stars');
    if(stars) stars.style.transform = `translateX(${(breeze * 1.1).toFixed(2)}px)`;
    const wall = document.getElementById('templeWall');
    if(wall) wall.style.transform = `translateX(${(breeze * 0.4).toFixed(2)}px)`;
    breezeRAF = requestAnimationFrame(breezeTick);
  }
  function startBreeze(){
    if(breezeRAF || Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    breezeTick();
  }
  function stopBreeze(){
    cancelAnimationFrame(breezeRAF);
    breezeRAF = null;
  }

  /* pause decorative animation entirely when the tab isn't visible */
  document.addEventListener('visibilitychange', ()=>{
    document.body.classList.toggle('page-hidden', document.hidden);
    if(document.hidden) stopBreeze(); else startBreeze();
  });

  /* ---------------- rare, unscheduled-feeling life ---------------- */
  function scheduleInsects(){
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    const layer = document.getElementById('ambient');
    const delay = 20000 + Math.random()*40000;
    setTimeout(()=>{
      if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)){ scheduleInsects(); return; }
      if(document.hidden){ scheduleInsects(); return; }
      const n = document.createElement('div');
      n.className = 'insect';
      n.style.left = (20+Math.random()*60)+'vw';
      n.style.top = (55+Math.random()*30)+'vh';
      n.style.animationDuration = (5+Math.random()*3)+'s';
      layer.appendChild(n);
      setTimeout(()=> n.remove(), 9000);
      scheduleInsects();
    }, delay);
  }

  function scheduleSingleLeaf(){
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    const layer = document.getElementById('ambient');
    const delay = 50000 + Math.random()*70000;
    setTimeout(()=>{
      if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)){ scheduleSingleLeaf(); return; }
      if(document.hidden){ scheduleSingleLeaf(); return; }
      const l = document.createElement('div');
      l.className = 'single-leaf';
      l.style.left = (10+Math.random()*80)+'vw';
      l.style.setProperty('--leaf-sway', (Math.random()*50-25)+'px');
      l.style.animationDuration = (9+Math.random()*4)+'s';
      layer.appendChild(l);
      setTimeout(()=> l.remove(), 14000);
      scheduleSingleLeaf();
    }, delay);
  }

  /* a single bird, only ever seen if the dawn theme is chosen, and rarely */
  function scheduleBird(){
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    const delay = 60000 + Math.random()*90000;
    setTimeout(()=>{
      if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)){ scheduleBird(); return; }
      if(Storage.get('theme', CONFIG.defaultTheme) === 'dawn' && !document.hidden){
        const b = document.createElement('div');
        b.className = 'bird-fly';
        b.innerHTML = '<svg viewBox="0 0 40 14" xmlns="http://www.w3.org/2000/svg"><path d="M2 8 Q10 0 20 7 Q30 0 38 8" fill="none" stroke="rgba(241,227,198,0.5)" stroke-width="1"/></svg>';
        document.getElementById('ambient').appendChild(b);
        setTimeout(()=> b.remove(), 13000);
      }
      scheduleBird();
    }, delay);
  }

  /* ---------------- tiny random life ----------------
     Every few minutes, exactly one small, quiet thing happens — never a fixed
     loop, never more than one at a time. */
  function scheduleTinyLife(){
    if(Storage.get('reduceMotion', CONFIG.reducedMotionDefault)) return;
    const delay = 150000 + Math.random() * 190000; // roughly 2.5–5.5 minutes
    setTimeout(()=>{
      if(!Storage.get('reduceMotion', CONFIG.reducedMotionDefault) && !document.hidden){
        const events = ['fireflyDiya', 'sparkDiya', 'featherNudge', 'templeBellFar', 'driftingLeaf'];
        triggerTinyLifeEvent(events[Math.floor(Math.random() * events.length)]);
      }
      scheduleTinyLife();
    }, delay);
  }

  function triggerTinyLifeEvent(ev){
    const corner = document.getElementById('krishna-corner');
    if(ev === 'fireflyDiya' && corner){
      const f = document.createElement('div');
      f.className = 'firefly diya-firefly';
      f.style.left = (44 + Math.random() * 12) + '%';
      f.style.top = '-10px';
      f.style.setProperty('--dx', (Math.random() * 14 - 7) + 'px');
      f.style.setProperty('--dy', '-16px');
      f.style.animationDuration = '5.5s, 3s';
      corner.appendChild(f);
      setTimeout(()=> f.remove(), 6000);
    } else if(ev === 'sparkDiya' && corner){
      const s = document.createElement('div');
      s.className = 'diya-spark';
      corner.appendChild(s);
      setTimeout(()=> s.remove(), 1800);
    } else if(ev === 'featherNudge'){
      const feather = document.querySelector('.kj-feather');
      if(feather){
        feather.style.transition = 'transform 1.3s ease';
        feather.style.transform = 'rotate(-23deg)';
        setTimeout(()=>{ feather.style.transform = ''; setTimeout(()=> feather.style.transition = '', 1300); }, 1300);
      }
    } else if(ev === 'templeBellFar'){
      document.querySelectorAll('.hbell').forEach(b=>{
        b.style.transition = 'transform 1.5s ease';
        b.style.transform = 'rotate(4deg)';
        setTimeout(()=>{ b.style.transform = ''; }, 1600);
      });
    } else if(ev === 'driftingLeaf'){
      const layer = document.getElementById('ambient');
      const l = document.createElement('div');
      l.className = 'single-leaf';
      l.style.left = (10 + Math.random() * 80) + 'vw';
      l.style.setProperty('--leaf-sway', (Math.random() * 50 - 25) + 'px');
      l.style.animationDuration = (9 + Math.random() * 4) + 's';
      layer.appendChild(l);
      setTimeout(()=> l.remove(), 14000);
    }
  }

  /* ---------------- gentle whispers ---------------- */
  let lastWhisperAt = 0;
  function whisper(text){
    const now = Date.now();
    if(now - lastWhisperAt < 15000) return; // never overlap, never feel frequent
    lastWhisperAt = now;
    let el = document.getElementById('whisper');
    if(!el){
      el = document.createElement('div');
      el.id = 'whisper';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(whisper._t);
    whisper._t = setTimeout(()=> el.classList.remove('show'), 4200);
  }

  /* ---------------- a quiet acknowledgment after someone stays a while ----------------
     After roughly ten uninterrupted minutes inside the courtyard, one soft line,
     shown once, never repeated. "Uninterrupted" means the clock only runs while
     the tab is actually in view — switching away and back doesn't reset it, but
     it does pause rather than keep counting time no one was actually here for. */
  let stayTimer = null, stayStart = null, stayRemaining = 10 * 60 * 1000, stayedWhisperShown = false;
  function armStayTimer(){
    if(stayedWhisperShown || stayRemaining <= 0) return;
    stayStart = Date.now();
    stayTimer = setTimeout(()=>{
      stayedWhisperShown = true;
      whisper("I'm glad you stayed.");
    }, stayRemaining);
  }
  document.addEventListener('visibilitychange', ()=>{
    if(stayedWhisperShown) return;
    if(document.hidden){
      if(stayTimer){ clearTimeout(stayTimer); stayTimer = null; }
      if(stayStart){ stayRemaining -= (Date.now() - stayStart); }
    } else {
      armStayTimer();
    }
  });

  /* ---------------- the diya deepens, almost imperceptibly, over time ----------------
     No numbers, no progress bar — just a flame that quietly becomes a little warmer,
     steadier, and brighter the more someone has actually sat with the courtyard. */
  function tuneDiya(){
    const visited = Storage.get('versesVisited', 0);
    const entries = Storage.get('journalEntries', []).length;
    const moods = Storage.get('emotionHistory', []).length;
    const total = visited + entries*2 + moods;
    const warmth = Math.min(total/60, 1);
    const flame = document.querySelector('#diya .flame');
    if(flame) flame.style.filter = `brightness(${(1+warmth*0.16).toFixed(2)}) saturate(${(1+warmth*0.12).toFixed(2)})`;
    const bowl = document.querySelector('#diya .bowl');
    if(bowl) bowl.style.boxShadow = `0 0 ${(14+warmth*9).toFixed(0)}px ${(2+warmth*2).toFixed(1)}px rgba(192,138,62,${(0.2+warmth*0.14).toFixed(2)})`;
  }

  /* ---------------- mood atmosphere ---------------- */
  function applyMoodAtmosphere(id){
    document.body.dataset.mood = id;
    const flame = document.querySelector('#diya .flame');
    const stars = document.getElementById('stars');
    const fog = document.querySelector('#ambient .fog');

    flame.classList.remove('flame-strong');
    flame.style.animationDuration = '3s';
    if(stars) stars.style.opacity = '';
    if(fog) fog.style.animationDuration = '';

    if(id === 'overwhelmed'){
      flame.style.animationDuration = '4.2s';
      if(fog) fog.style.animationDuration = '34s';
      if(stars) stars.style.opacity = '0.36';
    } else if(id === 'peace'){
      if(stars) stars.style.opacity = '0.75';
      if(fog) fog.style.animationDuration = '32s';
    } else if(id === 'angry'){
      flame.classList.add('flame-strong');
      flame.style.animationDuration = '1.6s';
    } else if(id === 'anxious'){
      flame.style.animationDuration = '1.8s';
    }
  }

  /* ---------------- navigation ---------------- */
  const views = document.querySelectorAll('.view');
  const navButtons = document.querySelectorAll('nav button');

  function showView(id){
    const incoming = document.getElementById('view-'+id);
    const outgoing = document.querySelector('.view.active');
    navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === id));
    document.body.dataset.view = id;
    window.scrollTo({top:0, behavior:'smooth'});

    if(outgoing && outgoing !== incoming){
      outgoing.style.transition = 'opacity 0.35s ease';
      outgoing.style.opacity = '0';
      setTimeout(()=>{
        outgoing.classList.remove('active');
        outgoing.style.opacity = '';
        outgoing.style.transition = '';
        revealView(incoming, id);
      }, 320);
    } else {
      revealView(incoming, id);
    }
  }

  function revealView(incoming, id){
    incoming.style.animation = 'none';
    void incoming.offsetWidth;
    incoming.style.animation = '';
    incoming.classList.add('active');
    if(id === 'stats') renderStats();
    if(id === 'journal') renderJournal();
    if(id === 'chapters') renderChapters();
    if(id === 'settings') updateJournalBackupUI();
    // reading mode: opening a verse hides everything but the back button and the verse itself
    document.body.classList.toggle('reading-mode', id === 'verse');
  }

  // Scoped to real nav buttons only. <body> also carries a `data-view`
  // attribute (set by showView(), just a CSS/state hook for the current
  // view) — an unscoped closest('[data-view]') matches body on every
  // click anywhere on the page, since body is an ancestor of everything.
  // That fired a second, stale setRoute() right behind any real one
  // (e.g. a chapter-row click), clobbering it before its hashchange had
  // even landed. Restricting the selector to actual <button data-view>
  // elements (nav bar + quick-links) removes body from matching at all.
  document.body.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-view]');
    if(btn) setRoute({ view: btn.dataset.view });
  });

  /* ---------------- routing (refresh + back/forward persistence) ----------------
     The URL hash is the single source of truth for "where am I": #/home,
     #/chapters, #/chapter/N, #/chapter/N/verse/M, or #/<view> for the other
     top-level sections (journal, stats, settings, search, collections,
     meditation). Changing the hash is what actually moves the app — either
     the browser does it (typing a URL, refreshing, Back/Forward, which fires
     'hashchange') or setRoute() does it on the person's behalf when they
     click something. Either way the same goToRoute() function ends up
     driving the visible view, so there's exactly one path through the code
     rather than two that could drift apart. */
  const KNOWN_SIMPLE_VIEWS = ['home','chapters','search','collections','journal','meditation','stats','settings'];

  function hashFor(route){
    if(route.view === 'verses' && route.chapter) return `#/chapter/${route.chapter}`;
    if(route.view === 'verse' && route.chapter && route.verse) return `#/chapter/${route.chapter}/verse/${route.verse}`;
    if(KNOWN_SIMPLE_VIEWS.includes(route.view)) return `#/${route.view}`;
    return '#/home';
  }

  function parseHash(){
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if(parts.length === 0) return { view: 'home' };

    if(parts[0] === 'chapter'){
      const chapterNumber = Number(parts[1]);
      if(!chapterNumber || isNaN(chapterNumber)) return { view: 'home' }; // malformed — fall back gracefully
      if(parts[2] === 'verse'){
        const verseNumber = Number(parts[3]);
        if(!verseNumber || isNaN(verseNumber)) return { view: 'verses', chapter: chapterNumber };
        return { view: 'verse', chapter: chapterNumber, verse: verseNumber };
      }
      return { view: 'verses', chapter: chapterNumber };
    }

    if(KNOWN_SIMPLE_VIEWS.includes(parts[0])) return { view: parts[0] };
    return { view: 'home' }; // unrecognized route — fall back gracefully rather than erroring
  }

  // Moves the app to a route. Normally this just updates the hash and lets
  // the 'hashchange' listener below do the actual work, so a click and a
  // Back-button press end up running identical code. {replace:true} is used
  // for corrective redirects (e.g. an invalid chapter number) so the bad
  // route doesn't itself become a Back-button stop.
  function setRoute(route, opts){
    opts = opts || {};
    const hash = hashFor(route);
    if(opts.replace){
      history.replaceState(null, '', hash);
      goToRoute(route);
      return;
    }
    if(location.hash === hash){
      goToRoute(route); // already there (e.g. re-clicking the open chapter) — just re-render
      return;
    }
    location.hash = hash; // triggers 'hashchange' -> goToRoute
  }

  // Renders whatever a route points to. `isRestore` is true only for the
  // very first route applied on page load, so a refreshed verse doesn't
  // re-trigger the "verse opened" whisper/stat-increment that a fresh,
  // deliberate open gets — the reading itself is still resumed either way.
  async function goToRoute(route, opts){
    opts = opts || {};
    const isRestore = !!opts.isRestore;
    toggleChapterCompletion(false); // every route change starts clean; the verse branch re-shows it only when it applies

    if(route.view === 'verses'){
      const ch = CHAPTERS.find(c => c.number === route.chapter);
      if(!ch){ setRoute({ view: 'home' }, { replace: true }); return; }
      currentChapterNumber = route.chapter;
      const verses = await loadChapterVerses(route.chapter);
      renderVerseList(ch);
      showView('verses');
      updateReadingJourney(route.chapter, verses.length);
      prefetchNextChapter(route.chapter);
      return;
    }

    if(route.view === 'verse'){
      const ch = CHAPTERS.find(c => c.number === route.chapter);
      if(!ch){ setRoute({ view: 'home' }, { replace: true }); return; }
      const verses = await loadChapterVerses(route.chapter);
      const v = verses.find(item => item.verse === route.verse);
      if(!v){ setRoute({ view: 'verses', chapter: route.chapter }, { replace: true }); return; }
      currentChapterNumber = route.chapter;
      currentVerseNumber = route.verse;
      renderVerseDetail(v);
      renderVerseNav(route.chapter, route.verse, verses.length);
      showView('verse');
      updateReadingJourney(route.chapter, verses.length, route.verse);
      updateProgressLabel(route.chapter, route.verse, verses.length);
      const isFinalVerse = verses.length > 0 && route.verse === verses.length;
      if(isFinalVerse){
        pulseFinalGlow();
        setTimeout(()=> showChapterCompletion(route.chapter), 1050);
      }
      if(!isRestore){
        const visited = Storage.get('versesVisited', 0);
        Storage.set('versesVisited', visited + 1);
        tuneDiya();
        whisper('Take your time.');
      }
      saveReadingProgress(route.chapter, route.verse);
      prefetchNextChapter(route.chapter);
      return;
    }

    if(route.view === 'home'){
      renderContinueCard();
      if(!isRestore) showView('home'); // on restore, home is already what's on screen — no need to re-transition into it
      return;
    }

    showView(route.view);
  }

  window.addEventListener('hashchange', ()=> goToRoute(parseHash()));

  /* ---------------- home / emotions ---------------- */
  const emotionGrid = document.getElementById('emotionGrid');
  const homeResponse = document.getElementById('homeResponse');

  function renderEmotions(){
    emotionGrid.innerHTML = EMOTIONS.map(em => `
      <div class="emotion-item" tabindex="0" role="button" data-emotion="${em.id}" aria-label="${em.label}" aria-pressed="false">${em.label}</div>
    `).join('');
  }

  function selectEmotion(id){
    const em = EMOTIONS.find(e => e.id === id);
    if(!em) return;
    document.querySelectorAll('.emotion-item').forEach(c=>{
      const isSelected = c.dataset.emotion === id;
      c.classList.toggle('selected', isSelected);
      c.setAttribute('aria-pressed', String(isSelected));
    });

    // fade the previous response out, swap the text, fade the new one in — never an instant replacement
    homeResponse.style.transition = 'opacity 0.36s ease';
    homeResponse.style.opacity = '0';
    setTimeout(()=>{
      homeResponse.textContent = em.response;
      homeResponse.style.opacity = '1';
    }, 320);

    const history = Storage.get('emotionHistory', []);
    history.push({ id, ts: Date.now() });
    Storage.set('emotionHistory', history);

    applyMoodAtmosphere(id);
    whisper('The courtyard understands.');
  }

  emotionGrid?.addEventListener('click', (e)=>{
    const card = e.target.closest('.emotion-item');
    if(card) selectEmotion(card.dataset.emotion);
  });
  emotionGrid?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){
      const card = e.target.closest('.emotion-item');
      if(card){ e.preventDefault(); selectEmotion(card.dataset.emotion); }
    }
  });

  /* ---------------- chapters / verse list / verse detail ---------------- */
  // Tracks which chapter's verse list is currently open, so the verse-detail
  // view knows what to render and where "back" should return to.
  let currentChapterNumber = null;
  let currentVerseNumber = null; // tracks the open verse so Previous/Next verse nav knows where it is

  // Draws the chapters overview from whatever CHAPTERS currently holds —
  // real metadata for chapters already fetched this session, a quiet
  // placeholder for ones that aren't loaded yet.
  function paintChapterList(){
    const list = document.getElementById('chapterList');
    if(!list) return;
    list.innerHTML = CHAPTERS.map(ch => `
      <div class="chapter-row" data-chapter="${ch.number}" tabindex="0" role="button" aria-label="${ch.title || `Chapter ${ch.number}`}">
        <span class="chapter-num" aria-hidden="true">${String(ch.number).padStart(2,'0')}</span>
        <span class="chapter-info">
          <span class="chapter-title">${ch.title || `Chapter ${ch.number}`}</span>
          <span class="chapter-sub">${ch.subtitle != null ? ch.subtitle : ''}</span>
        </span>
        <span class="chapter-count">${ch.verseCount != null ? `${ch.verseCount} verses` : ''}</span>
      </div>
    `).join('');
  }

  // The overview is the one place the app needs every chapter's metadata
  // at once — title/subtitle/verseCount live inside each chapter's own
  // file, not the manifest, so they're fetched here, the first time this
  // view is opened. Already-loaded chapters (e.g. one just finished
  // reading) resolve instantly from cache and cost no extra request.
  function renderChapters(){
    paintChapterList();
    const needsLoad = CHAPTERS.filter(ch => ch.verseCount === null);
    if(!needsLoad.length) return;
    Promise.all(needsLoad.map(ch => loadChapterVerses(ch.number))).then(paintChapterList);
  }

  /* ---------------- reading journey indicator ----------------
     A thin line living at the sticky header's bottom edge (see #readingJourney
     in index.html/styles.css), visible only while viewing a chapter's verse
     list or an individual verse. Its width always comes from a known verse
     position — the verse actually being read, or (in the verse list) the
     last-read verse in that chapter — never from scroll position, and it
     only moves when goToRoute() is driven by real navigation between verses. */
  function updateReadingJourney(chapterNumber, totalVerses, verseNumber){
    const fill = document.getElementById('readingJourneyFill');
    if(!fill) return;
    let progressVerse = verseNumber;
    if(progressVerse == null){
      const last = Storage.get('lastReading', null);
      progressVerse = (last && last.chapter === chapterNumber) ? last.verse : 0;
    }
    const pct = totalVerses > 0 ? Math.min(100, Math.max(0, (progressVerse / totalVerses) * 100)) : 0;
    fill.style.width = pct.toFixed(2) + '%';
  }

  // A brief, quiet brightening of the journey line on reaching a chapter's
  // final verse, then it fades back to its normal glow after about a second —
  // no badge, no percentage, no celebration.
  function pulseFinalGlow(){
    const fill = document.getElementById('readingJourneyFill');
    if(!fill) return;
    fill.classList.add('at-final');
    setTimeout(()=> fill.classList.remove('at-final'), 1000);
  }

  function updateProgressLabel(chapterNumber, verseNumber, totalVerses){
    const label = document.getElementById('readingProgressLabel');
    if(!label) return;
    label.textContent = totalVerses > 0 ? `Chapter ${chapterNumber} • Verse ${verseNumber} of ${totalVerses}` : '';
  }

  /* ---------------- chapter completion reflection ----------------
     Shown a moment after the final verse of a chapter is reached — never
     tied to a hardcoded chapter number, since "next chapter" is simply
     whichever chapter number follows in CHAPTERS. */
  const CHAPTER_COMPLETION_LINE = "Take a moment before beginning the next chapter.";
  const FINAL_CHAPTER_NUMBER = 18;
  const FINAL_CHAPTER_COMPLETION_LINE = "Thank you for walking through the Bhagavad Gita.\nMay Krishna's wisdom remain with you beyond these pages.";

  function toggleChapterCompletion(show){
    const el = document.getElementById('chapterCompletion');
    if(!el) return;
    el.classList.toggle('visible', show);
    if(!show) el.hidden = true;
  }

  function showChapterCompletion(chapterNumber){
    // guard against a stale timer firing after the person has already moved on
    if(currentChapterNumber !== chapterNumber || document.body.dataset.view !== 'verse') return;
    const el = document.getElementById('chapterCompletion');
    const textEl = document.getElementById('chapterCompletionText');
    const nextBtn = document.getElementById('continueNextChapterBtn');
    if(!el || !textEl || !nextBtn) return;
    textEl.textContent = chapterNumber === FINAL_CHAPTER_NUMBER
      ? FINAL_CHAPTER_COMPLETION_LINE
      : CHAPTER_COMPLETION_LINE;
    const nextChapter = CHAPTERS.find(c => c.number === chapterNumber + 1);
    if(nextChapter){
      nextBtn.textContent = `Continue to Chapter ${chapterNumber + 1}`;
      nextBtn.style.display = '';
      nextBtn.dataset.nextChapter = String(chapterNumber + 1);
    } else {
      nextBtn.style.display = 'none'; // nothing written yet to continue into
    }
    el.hidden = false;
    requestAnimationFrame(()=> el.classList.add('visible'));
  }

  document.getElementById('continueNextChapterBtn')?.addEventListener('click', (e)=>{
    const next = Number(e.currentTarget.dataset.nextChapter);
    if(!next) return;
    toggleChapterCompletion(false);
    setRoute({ view: 'verses', chapter: next });
  });
  document.getElementById('stayHereBtn')?.addEventListener('click', ()=>{
    toggleChapterCompletion(false);
  });

  function renderVerseList(ch){
    document.getElementById('verseListTitle').textContent = ch.title;
    document.getElementById('verseListSub').textContent = ch.subtitle;
    const list = document.getElementById('verseList');
    const verses = getVersesForChapter(ch.number);

    if(verses.length === 0){
      list.innerHTML = `<div class="empty-state"><span class="glyph" aria-hidden="true">❦</span><p>This chapter's verses haven't been written yet. Come back soon.</p></div>`;
      return;
    }

    list.innerHTML = verses.map(v => `
      <div class="chapter-row" data-verse="${v.verse}" tabindex="0" role="button" aria-label="${v.title}">
        <span class="chapter-num" aria-hidden="true">${String(v.verse).padStart(2,'0')}</span>
        <span class="chapter-info">
          <span class="chapter-title">${v.title}</span>
          <span class="chapter-sub">${v.index}</span>
        </span>
      </div>
    `).join('');
  }

  /* ---------------- reading resume ----------------
     Every time a verse is opened (fresh or restored on refresh), the current
     chapter/verse and a timestamp are saved. This never surfaces as a badge
     or streak — just a single quiet "continue where you left off" card on
     Home, and only until the person opens a different verse or dismisses it. */
  function saveReadingProgress(chapterNumber, verseNumber){
    Storage.set('lastReading', { chapter: chapterNumber, verse: verseNumber, ts: Date.now() });
  }

  function renderContinueCard(){
    const card = document.getElementById('continueCard');
    if(!card) return;
    const last = Storage.get('lastReading', null);
    if(!last || !last.chapter || !last.verse){ card.style.display = 'none'; return; }
    const ch = CHAPTERS.find(c => c.number === last.chapter);
    const chapterLabel = (ch && ch.title) || `Chapter ${last.chapter}`;
    const detail = document.getElementById('continueDetail');
    if(detail) detail.textContent = `Last read: ${chapterLabel} • Verse ${last.verse}`;
    card.style.display = '';
  }

  document.getElementById('continueReadingBtn')?.addEventListener('click', ()=>{
    const last = Storage.get('lastReading', null);
    if(!last) return;
    setRoute({ view: 'verse', chapter: last.chapter, verse: last.verse });
  });
  document.getElementById('continueStartHomeBtn')?.addEventListener('click', ()=>{
    // "Start from Home" never deletes the saved progress — it just sets the
    // card aside for this visit so the emotion picker is what greets them.
    const card = document.getElementById('continueCard');
    if(card) card.style.display = 'none';
  });

  function renderVerseDetail(v){
    document.getElementById('verseDetail').innerHTML = `
      <div class="verse-frontispiece">
        <div class="verse-index">${v.index}</div>
        <h3 class="verse-title">${v.title}</h3>
        <p class="verse-sanskrit">${v.sanskrit}</p>
        <p class="verse-translit">${v.transliteration}</p>
        <p class="verse-translation">${v.translation}</p>
      </div>
      <div class="verse-section"><h4>Historical context</h4><p>${v.historicalContext}</p></div>
      <div class="verse-section"><h4>Krishna's teaching</h4><p>${v.teaching}</p></div>
      <div class="verse-section"><h4>Modern reflection</h4><p>${v.modernReflection}</p></div>
      <div class="verse-section"><h4>If Kanha Ji sat beside you today…</h4><p>${v.ifKanhaSatBeside}</p></div>
      <div class="verse-section"><h4>Takeaway</h4><p>${v.takeaway}</p></div>
      <div class="verse-section">
        <h4>Reflection questions</h4>
        <ul>${v.questions.map(q => `<li>${q}</li>`).join('')}</ul>
        <div class="verse-tags">${v.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    `;
  }

  /* ---------------- verse navigation (Previous / Next) ----------------
     Renders the two footer buttons for the currently-open verse. Pure
     labeling/branching logic — the actual navigation always goes through
     setRoute()/goToRoute(), the same path every other nav in the app uses,
     so reading progress, the reading-journey line, and scroll-to-top all
     keep working exactly as they already do for any other route change. */
  function renderVerseNav(chapterNumber, verseNumber, versesLength){
    const prevBtn = document.getElementById('prevVerseBtn');
    const nextBtn = document.getElementById('nextVerseBtn');
    if(!prevBtn || !nextBtn) return;

    if(verseNumber > 1){
      prevBtn.textContent = '← Previous Verse';
      prevBtn.dataset.action = 'prev-verse';
    } else {
      prevBtn.textContent = '← Back to Chapter';
      prevBtn.dataset.action = 'back-to-chapter';
    }

    if(verseNumber < versesLength){
      nextBtn.textContent = 'Next Verse →';
      nextBtn.dataset.action = 'next-verse';
      nextBtn.style.display = '';
    } else if(chapterNumber === FINAL_CHAPTER_NUMBER){
      // Final verse of the final chapter: offer a graceful way back to
      // Home alongside the chapter-completion card, instead of hiding
      // the button as happens for every other chapter's final verse.
      nextBtn.textContent = '🏡 Back to Home';
      nextBtn.dataset.action = 'back-home';
      nextBtn.style.display = '';
    } else {
      // Final verse of chapters 1–17: no Next Chapter / Return Home here.
      // The chapter-completion card below is the only way to continue —
      // this avoids a duplicate action and preserves that reflective pause.
      nextBtn.style.display = 'none';
      delete nextBtn.dataset.action;
    }
  }

  document.getElementById('prevVerseBtn')?.addEventListener('click', (e)=>{
    const action = e.currentTarget.dataset.action;
    if(action === 'back-to-chapter'){
      setRoute({ view: 'verses', chapter: currentChapterNumber });
    } else if(action === 'prev-verse'){
      setRoute({ view: 'verse', chapter: currentChapterNumber, verse: currentVerseNumber - 1 });
    }
  });

  document.getElementById('nextVerseBtn')?.addEventListener('click', (e)=>{
    const action = e.currentTarget.dataset.action;
    if(action === 'next-verse'){
      setRoute({ view: 'verse', chapter: currentChapterNumber, verse: currentVerseNumber + 1 });
    } else if(action === 'back-home'){
      setRoute({ view: 'home' });
    }
  });

  document.getElementById('chapterList')?.addEventListener('click', (e)=>{
    const row = e.target.closest('.chapter-row');
    if(row) setRoute({ view: 'verses', chapter: Number(row.dataset.chapter) });
  });
  document.getElementById('chapterList')?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){
      const row = e.target.closest('.chapter-row');
      if(row){ e.preventDefault(); setRoute({ view: 'verses', chapter: Number(row.dataset.chapter) }); }
    }
  });

  document.getElementById('verseList')?.addEventListener('click', (e)=>{
    const row = e.target.closest('.chapter-row');
    if(row) setRoute({ view: 'verse', chapter: currentChapterNumber, verse: Number(row.dataset.verse) });
  });
  document.getElementById('verseList')?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){
      const row = e.target.closest('.chapter-row');
      if(row){ e.preventDefault(); setRoute({ view: 'verse', chapter: currentChapterNumber, verse: Number(row.dataset.verse) }); }
    }
  });

  document.getElementById('backToChapters').addEventListener('click', ()=> setRoute({ view: 'chapters' }));
  document.getElementById('backToVerses').addEventListener('click', ()=>{
    if(currentChapterNumber === null){ setRoute({ view: 'chapters' }); return; }
    setRoute({ view: 'verses', chapter: currentChapterNumber });
  });

  /* ---------------- journal ---------------- */
  function renderJournal(){
    const entries = Storage.get('journalEntries', []);
    const container = document.getElementById('journalEntries');
    if(entries.length === 0){
      container.innerHTML = `<div class="empty-state"><span class="glyph" aria-hidden="true">❦</span><p>Your journal is empty. Whatever you write stays only with you.</p></div>`;
      return;
    }
    container.innerHTML = entries.slice().reverse().map(e => `
      <div class="journal-entry">
        <div class="journal-entry-date">${new Date(e.ts).toLocaleString()}</div>
        <p>${escapeHtml(e.text)}</p>
      </div>
    `).join('');
  }

  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  document.getElementById('saveJournalBtn').addEventListener('click', ()=>{
    const input = document.getElementById('journalInput');
    const text = input.value.trim();
    if(!text) return;
    const entries = Storage.get('journalEntries', []);
    entries.push({ text, ts: Date.now() });
    Storage.set('journalEntries', entries);
    input.value = '';
    renderJournal();
    updateJournalBackupUI();
    tuneDiya();
    whisper("I'll keep this here for you.");
  });

  /* ---------------- journal backup (export / import) ----------------
     Manual, user-initiated file export/import of the exact same
     `journalEntries` Storage already holds — no network calls, no new
     Storage keys, nothing local becomes non-local. This is the only way
     journal entries survive a cleared cache or a move to a new device,
     while keeping the Journal itself untouched: offline-first, account-
     free, never synced, never tracked.

     The Courtyard never exports on its own — it only remembers, quietly,
     whether the reflections on this device have made it into a backup
     yet, and says so plainly. `journalBackupMeta` is the only new Storage
     key: { lastBackupAt: ISO string | null, backedUpCount: number }.
     Pending count is derived, not stored separately — it's simply how
     many entries exist beyond `backedUpCount`, clamped at 0 so a cleared
     journal (or an older backup with more entries than exist now) never
     reads as a negative number. */

  function getJournalBackupMeta(){
    return Storage.get('journalBackupMeta', { lastBackupAt: null, backedUpCount: 0 });
  }
  function setJournalBackupMeta(meta){
    Storage.set('journalBackupMeta', meta);
  }

  // "Today, 8:42 PM" / "Yesterday, 9:14 PM" / "Jun 3, 4:05 PM" / "Never"
  function formatBackupTimestamp(iso){
    if(!iso) return 'Never';
    const d = new Date(iso);
    const now = new Date();
    const startOfDay = dt => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if(diffDays === 0) return `Today, ${time}`;
    if(diffDays === 1) return `Yesterday, ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  }

  // Keeps the Export button, its description, the "Last backup" line, and
  // the quiet status line honest — called whenever Settings is opened,
  // and after anything that changes the entry count (save, import, clear).
  function updateJournalBackupUI(){
    const entries = Storage.get('journalEntries', []);
    const meta = getJournalBackupMeta();
    const pending = Math.max(0, entries.length - (meta.backedUpCount || 0));

    const exportBtn = document.getElementById('exportJournalBtn');
    const exportDesc = document.getElementById('exportJournalDesc');
    if(!exportBtn || !exportDesc) return;

    const empty = entries.length === 0;
    exportBtn.disabled = empty;
    exportDesc.textContent = empty
      ? 'Nothing to export yet.'
      : 'Download a private backup of your reflections.';

    const lastBackupEl = document.getElementById('journalLastBackupValue');
    if(lastBackupEl) lastBackupEl.textContent = formatBackupTimestamp(meta.lastBackupAt);

    const statusEl = document.getElementById('journalBackupStatus');
    if(statusEl){
      if(empty) statusEl.textContent = '🌿 No reflections yet.';
      else if(pending > 0) statusEl.textContent = `🌿 ${pending} ${pending === 1 ? 'reflection hasn\u2019t' : 'reflections haven\u2019t'} been backed up yet.`;
      else statusEl.textContent = '✓ Your journal is safely backed up.';
    }
  }

  function setJournalBackupStatus(text){
    const el = document.getElementById('journalBackupStatus');
    if(el) el.textContent = text;
  }

  function exportJournal(){
    const entries = Storage.get('journalEntries', []);
    if(entries.length === 0) return; // the button is disabled too; this is just a safety net
    const payload = {
      app: CONFIG.appTitle || "Kanha Ji's Courtyard",
      appVersion: CONFIG.version || null,
      exportedAt: new Date().toISOString(),
      entries
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanha-ji-journal-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const meta = getJournalBackupMeta();
    meta.lastBackupAt = new Date().toISOString();
    meta.backedUpCount = entries.length;
    setJournalBackupMeta(meta);
    updateJournalBackupUI();
    setJournalBackupStatus('🌿 Your reflections have been safely packed.');
  }

  // A backup is considered valid if it has the shape exportJournal() produces:
  // an object with an `entries` array of { text: string, ts: number }.
  // Deliberately not stricter than that, so a slightly older export (or one
  // with extra fields) still restores instead of being rejected outright.
  function isValidJournalBackup(data){
    return !!data && Array.isArray(data.entries) && data.entries.every(e =>
      e && typeof e.text === 'string' && typeof e.ts === 'number'
    );
  }

  function importJournalFromFile(file){
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try{
        data = JSON.parse(reader.result);
      }catch(e){
        setJournalBackupStatus("That file couldn't be read as a journal backup. Nothing was changed.");
        return;
      }
      if(!isValidJournalBackup(data)){
        setJournalBackupStatus("That doesn't look like a Courtyard journal backup. Nothing was changed.");
        return;
      }
      if(!confirm('Importing will replace the journal currently stored on this device. Continue?')) return;
      Storage.set('journalEntries', data.entries);
      // An imported journal is, by definition, already backed up somewhere —
      // this file is that backup.
      const meta = getJournalBackupMeta();
      meta.lastBackupAt = new Date().toISOString();
      meta.backedUpCount = data.entries.length;
      setJournalBackupMeta(meta);
      renderJournal();
      renderStats();
      updateJournalBackupUI();
      setJournalBackupStatus(`Restored ${data.entries.length} ${data.entries.length === 1 ? 'entry' : 'entries'}.`);
      whisper('Your journal is back with you.');
    };
    reader.onerror = () => {
      setJournalBackupStatus("That file couldn't be read. Nothing was changed.");
    };
    reader.readAsText(file);
  }

  document.getElementById('exportJournalBtn')?.addEventListener('click', exportJournal);

  document.getElementById('importJournalBtn')?.addEventListener('click', ()=>{
    document.getElementById('importJournalInput')?.click();
  });

  document.getElementById('importJournalInput')?.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) importJournalFromFile(file);
    e.target.value = ''; // allow re-selecting the same file again later
  });

  /* ---------------- stats ---------------- */
  /* Warm words instead of zeros while the journey is still new — the numbers
     become real gradually, rather than announcing "0" at someone on day one. */
  function renderStats(){
    const history = Storage.get('emotionHistory', []);
    const entries = Storage.get('journalEntries', []);
    const versesVisited = Storage.get('versesVisited', 0);

    const verseEl = document.getElementById('statVerses');
    const journalEl = document.getElementById('statJournal');
    const daysEl = document.getElementById('statDays');
    const moodEl = document.getElementById('statMood');

    verseEl.textContent = versesVisited > 0 ? versesVisited : 'Not yet';
    verseEl.classList.toggle('stat-word', versesVisited === 0);

    journalEl.textContent = entries.length > 0 ? entries.length : 'Waiting';
    journalEl.classList.toggle('stat-word', entries.length === 0);

    const days = new Set(history.map(h => new Date(h.ts).toDateString()));
    if(entries.length) entries.forEach(e => days.add(new Date(e.ts).toDateString()));
    const dayCount = days.size;
    daysEl.textContent = dayCount <= 1 ? 'One quiet visit' : dayCount;
    daysEl.classList.toggle('stat-word', dayCount <= 1);

    if(history.length){
      const counts = {};
      history.forEach(h => counts[h.id] = (counts[h.id]||0)+1);
      const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
      const em = EMOTIONS.find(e => e.id === top);
      moodEl.textContent = em ? em.label.replace(/^I'?m?\s*/i,'').replace(/^I\s+/i,'') : 'Still discovering';
      moodEl.classList.remove('stat-word');
    } else {
      moodEl.textContent = 'Still discovering';
      moodEl.classList.add('stat-word');
    }
  }

  /* ---------------- settings ---------------- */
  const motionToggle = document.getElementById('toggleMotion');
  function syncMotionToggle(){
    const reduced = Storage.get('reduceMotion', CONFIG.reducedMotionDefault);
    motionToggle.classList.toggle('on', reduced);
    motionToggle.setAttribute('aria-pressed', reduced);
    document.body.classList.toggle('motion-reduced', reduced);
  }
  motionToggle.addEventListener('click', ()=>{
    const reduced = !Storage.get('reduceMotion', CONFIG.reducedMotionDefault);
    Storage.set('reduceMotion', reduced);
    syncMotionToggle();
    initAmbient();
    if(!reduced) humanizeTimings();
    if(reduced && featherTimer){ clearTimeout(featherTimer); featherTimer = null; }
    if(reduced){ const fw = document.getElementById('feather-wander'); if(fw) fw.dataset.flying = '0'; }
    if(!reduced && !featherTimer){ scheduleFeather(); }
    if(reduced){ stopBreeze(); } else { startBreeze(); }
  });

  function applyTheme(theme){
    if(theme === 'dusk'){ delete document.body.dataset.theme; }
    else{ document.body.dataset.theme = theme; }
    document.querySelectorAll('.theme-dot').forEach(d=>{
      const isActive = d.dataset.theme === theme;
      d.classList.toggle('active', isActive);
      d.setAttribute('aria-pressed', String(isActive));
    });
    Storage.set('theme', theme);
  }
  document.querySelectorAll('.theme-dot').forEach(dot=>{
    dot.addEventListener('click', ()=> applyTheme(dot.dataset.theme));
  });
  applyTheme(Storage.get('theme', CONFIG.defaultTheme));

  document.getElementById('replayWelcomeBtn').addEventListener('click', ()=>{
    Storage.set('lastArrivalShown', null);
    runArrival(true);
  });

  document.getElementById('clearDataBtn').addEventListener('click', ()=>{
    if(confirm("Clear your journal and history? This can't be undone.")){
      Storage.set('journalEntries', []);
      Storage.set('emotionHistory', []);
      Storage.set('versesVisited', 0);
      // Nothing left to back up, so the pending count resets along with
      // the journal itself. Last backup date is left untouched — it's
      // still a true historical fact.
      const meta = getJournalBackupMeta();
      meta.backedUpCount = 0;
      setJournalBackupMeta(meta);
      renderJournal();
      renderStats();
      updateJournalBackupUI();
    }
  });

  document.getElementById('createCollectionBtn')?.addEventListener('click', ()=>{
    alert('Collections will be buildable once verse content exists. Coming in a later stage.');
  });

  /* ---------------- search (placeholder logic) ---------------- */
  document.getElementById('searchInput').addEventListener('input', (e)=>{
    const results = document.getElementById('searchResults');
    if(e.target.value.trim().length === 0){
      results.innerHTML = `<div class="empty-state"><span class="glyph" aria-hidden="true">❦</span><p>The scriptures are still finding their place here.</p></div>`;
    } else {
      results.innerHTML = `<div class="empty-state"><span class="glyph" aria-hidden="true">❦</span><p>Search index isn't built yet — it will search real verses once they're added.</p></div>`;
    }
  });

  /* ---------------- ambient sound: modular local MP3 ambience, never autoplay ----------------
     Ambience options are entirely data-driven, the same pattern as chapters:
     assets/audio/audio.json is the single source of truth — an ordered array of
     { name, file } entries. AMBIENCE_SOURCES below is never hand-edited; it's
     rebuilt from that manifest by buildAmbienceSources() inside loadContent().
     Adding, renaming, or removing an ambience never requires touching this file —
     add/remove the MP3 under assets/audio/ and list it (or don't) in audio.json.
     "Silent Courtyard" is the one exception: it's a fixed control (stop playback),
     not an ambience file, so it stays as a static button in index.html.

     Files are lazy: nothing is fetched until a person actually picks an ambience,
     and only one ever plays at once. Switching crossfades over ~2 seconds; volume
     ramps smoothly. If a file is missing or fails to load, the audio element's
     error event fires and the app fails quietly back to "Silent Courtyard" (see
     handleError below) rather than breaking anything. */
  // Fallback manifest used only if assets/audio/audio.json can't be fetched
  // (e.g. opened without a local server, or the file doesn't exist yet) —
  // same shape either way: an ordered array of { name, file }.
  let AMBIENCE_LIST = [
    { name: 'Temple Courtyard', file: 'temple.mp3' },
    { name: "Krishna's Flute", file: 'bansuri.mp3' },
    { name: 'Yamuna River', file: 'river.mp3' },
    { name: 'Banyan Breeze', file: 'banyan.mp3' },
    { name: 'Village Evening', file: 'village.mp3' }
  ];
  // Built from AMBIENCE_LIST by buildAmbienceSources(); keyed by filename minus
  // extension (e.g. "temple.mp3" -> "temple"), which also becomes each button's
  // data-sound value and the value stored under the "lastAmbience" key.
  let AMBIENCE_SOURCES = {};
  function ambienceKeyFromFile(file){
    return String(file).replace(/\.[^/.]+$/, '');
  }
  function buildAmbienceSources(list){
    const sources = {};
    (Array.isArray(list) ? list : []).forEach(entry=>{
      if(!entry || !entry.file) return;
      const key = ambienceKeyFromFile(entry.file);
      if(!key) return;
      sources[key] = { url: `assets/audio/${entry.file}`, name: entry.name || key };
    });
    AMBIENCE_SOURCES = sources;
  }
  const CROSSFADE_MS = 2000;
  const LOOP_XFADE_MS = 700; // a short self-crossfade just before each clip's natural end,
                              // so looping is a seam you can't hear rather than a hard restart/pop

  const SoundScape = (function(){
    let userInteracted = false;
    let slotA = null, slotB = null, activeSlot = null, activeType = null;
    let switching = false; // true for the ~2s a crossfade is in flight — guards against double-clicks and overlapping fades
    const fadeHandles = new WeakMap(); // element -> current rAF id, so a new fade on an element cancels its own stale one (no leaked loops, no overlapping ramps)

    function setSwitching(v){
      switching = v;
      const panel = document.getElementById('soundPanel');
      if(panel) panel.classList.toggle('switching', v);
    }

    function markInteracted(){ userInteracted = true; }
    document.addEventListener('pointerdown', markInteracted, {once:true});
    document.addEventListener('keydown', markInteracted, {once:true});

    function getVolume(){ return Storage.get('ambientVolume', CONFIG.defaultVolume); }
    function otherSlot(el){ return el === slotA ? slotB : slotA; }

    function makeSlot(){
      const el = document.createElement('audio');
      el.loop = false; // looping is handled manually below via armLoop(), not the native attribute
      el.preload = 'none'; // lazy: only ever loads once played
      el.volume = 0;
      el.style.display = 'none';
      el.addEventListener('error', ()=> handleError(el));
      document.body.appendChild(el);
      return el;
    }
    function ensureSlots(){
      if(!slotA) slotA = makeSlot();
      if(!slotB) slotB = makeSlot();
    }

    function fade(el, from, to, ms, onDone){
      const prevHandle = fadeHandles.get(el);
      if(prevHandle) cancelAnimationFrame(prevHandle);
      const start = performance.now();
      function step(now){
        const t = Math.min(1, (now - start) / ms);
        el.volume = from + (to - from) * t;
        if(t < 1){ fadeHandles.set(el, requestAnimationFrame(step)); }
        else{ fadeHandles.delete(el); if(onDone) onDone(); }
      }
      fadeHandles.set(el, requestAnimationFrame(step));
    }

    // hands playback to the other slot ~700ms before this clip ends, crossfading
    // the two so the loop point is never a silent gap or an audible pop
    function armLoop(el, type){
      function onTime(){
        if(activeSlot !== el || activeType !== type){ el.removeEventListener('timeupdate', onTime); return; }
        if(!el.duration || isNaN(el.duration) || el.duration < (LOOP_XFADE_MS/1000)*2) return;
        if((el.duration - el.currentTime) * 1000 > LOOP_XFADE_MS) return;
        el.removeEventListener('timeupdate', onTime);
        const next = otherSlot(el);
        const src = AMBIENCE_SOURCES[type].url;
        if(next.getAttribute('src') !== src) next.src = src;
        next.currentTime = 0;
        next.volume = 0;
        next.play().catch(()=>{});
        fade(next, 0, getVolume(), LOOP_XFADE_MS);
        fade(el, el.volume, 0, LOOP_XFADE_MS, ()=> el.pause());
        activeSlot = next;
        armLoop(next, type);
      }
      el.addEventListener('timeupdate', onTime);
    }

    function handleError(el){
      if(activeSlot !== el) return;
      // a network hiccup or an unreachable file — fail quietly back to silence, never a stuck or broken control
      activeSlot = null; activeType = null; setSwitching(false);
      document.dispatchEvent(new CustomEvent('ambience-error'));
    }

    function play(type){
      // audio only ever begins from a direct, deliberate gesture — never on our own
      if(!userInteracted) return;
      // ignore taps mid-crossfade, and ignore re-picking whatever's already playing
      if(switching || type === activeType) return;
      const source = AMBIENCE_SOURCES[type];
      if(!source || !source.url) return; // guard only — every configured ambience has a path
      ensureSlots();
      const incoming = activeSlot ? otherSlot(activeSlot) : slotA;
      const outgoing = activeSlot;
      incoming.src = source.url;
      incoming.currentTime = 0;
      incoming.volume = 0;
      setSwitching(true);
      incoming.play().catch(()=>{ setSwitching(false); /* browser blocked playback outside a gesture — safe to ignore */ });
      fade(incoming, 0, getVolume(), CROSSFADE_MS, ()=>{ setSwitching(false); });
      if(outgoing) fade(outgoing, outgoing.volume, 0, CROSSFADE_MS, ()=> outgoing.pause());
      activeSlot = incoming;
      activeType = type;
      armLoop(incoming, type);
    }

    function stop(){
      if(!activeSlot) return;
      const el = activeSlot;
      setSwitching(true);
      fade(el, el.volume, 0, CROSSFADE_MS, ()=>{ el.pause(); setSwitching(false); });
      activeSlot = null;
      activeType = null;
    }

    function setVolume(v){
      Storage.set('ambientVolume', v);
      if(activeSlot) fade(activeSlot, activeSlot.volume, v, 300);
    }

    return { play, stop, setVolume, getVolume, current: ()=> activeType, isSwitching: ()=> switching };
  })();

  const soundToggle = document.getElementById('soundToggle');
  const soundPanel = document.getElementById('soundPanel');

  // Remember which atmosphere was last chosen and show it as selected —
  // but never start audio on our own. Sound only ever begins on a click.
  function setActiveAmbienceUI(type){
    document.querySelectorAll('#soundPanel [data-sound]').forEach(b=>{
      const isActive = b.dataset.sound === type;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });
    document.getElementById('soundOff').setAttribute('aria-pressed', String(!type));
  }

  /* Builds one button per manifest entry, inserted directly into #soundPanel
     (as siblings of the hidden #ambienceAnchor marker, before "Silent
     Courtyard") — not nested inside a wrapper div. #soundPanel is a plain
     CSS flex column with no wrapper-aware styling, so the buttons need to
     be its direct children for the existing spacing/layout to apply
     unchanged; the anchor just marks where they go and is otherwise
     invisible and inert. Button markup (tag, attributes) intentionally
     mirrors what used to be written by hand in index.html, so the existing
     CSS (which targets "#soundPanel button" generically, not specific
     buttons) needs no changes. Called once, after the manifest has been
     fetched and AMBIENCE_SOURCES built. */
  function renderAmbienceButtons(){
    const anchor = document.getElementById('ambienceAnchor');
    if(!anchor) return;
    // clear any previously-inserted buttons (harmless if called again)
    document.querySelectorAll('#soundPanel button[data-sound]').forEach(b=> b.remove());
    Object.keys(AMBIENCE_SOURCES).forEach(key=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.sound = key;
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = AMBIENCE_SOURCES[key].name;
      anchor.parentNode.insertBefore(btn, anchor);
    });
  }

  /* Wires up everything in the sound panel: the toggle, each ambience
     button (built moments earlier by renderAmbienceButtons), Silent
     Courtyard, the volume slider, and error fallback. Runs once, after
     the manifest has loaded and the buttons above exist in the DOM —
     this is the only reason ambience setup now waits for init() instead
     of running at top-level like it used to. */
  function initAmbienceUI(){
    soundToggle.addEventListener('click', ()=>{
      const expanded = soundToggle.getAttribute('aria-expanded') === 'true';
      soundToggle.setAttribute('aria-expanded', String(!expanded));
      soundPanel.classList.toggle('open', !expanded);
    });
    document.querySelectorAll('#soundPanel [data-sound]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const type = btn.dataset.sound;
        if(SoundScape.isSwitching() || type === SoundScape.current()) return;
        setActiveAmbienceUI(type);
        Storage.set('lastAmbience', type);
        SoundScape.play(type);
      });
    });
    document.getElementById('soundOff').addEventListener('click', ()=>{
      if(SoundScape.isSwitching()) return;
      setActiveAmbienceUI(null);
      Storage.set('lastAmbience', null);
      SoundScape.stop();
    });
    // a network hiccup or unreachable file fails quietly — drop the UI back to "Silent Courtyard"
    document.addEventListener('ambience-error', ()=>{
      setActiveAmbienceUI(null);
      Storage.set('lastAmbience', null);
    });

    const lastAmbience = Storage.get('lastAmbience', CONFIG.defaultAmbience);
    // only restore the UI selection if that ambience still exists in the
    // current manifest — an ambience removed from audio.json since the
    // last visit should quietly fall back to "Silent Courtyard" rather
    // than showing a phantom selection for a button that no longer exists.
    if(lastAmbience && AMBIENCE_SOURCES[lastAmbience]) setActiveAmbienceUI(lastAmbience);
    else if(lastAmbience) Storage.set('lastAmbience', null);

    const soundVolume = document.getElementById('soundVolume');
    soundVolume.value = Math.round(SoundScape.getVolume() * 100);
    soundVolume.addEventListener('input', ()=>{
      SoundScape.setVolume(soundVolume.value / 100);
    });
  }

  /* ---------------- init ----------------
     Content (config/chapters/verses) is fetched before the app renders anything
     that depends on it. This is the only behavioral change the data-driven
     architecture requires: chapter/verse rendering now waits one microtask
     for local JSON instead of reading a hardcoded array — visually identical,
     since nothing else in the app depends on that data being ready sooner. */
  async function init(){
    await loadContent();
    renderAmbienceButtons();
    initAmbienceUI();
    runArrival();
    initStars();
    renderEmotions();
    //renderChapters();
    syncMotionToggle();
    initAmbient();
    humanizeTimings();
    startBreeze();
    scheduleFeather();
    scheduleInsects();
    scheduleSingleLeaf();
    scheduleBird();
    scheduleTinyLife();
    tuneDiya();
    armStayTimer();

    /* Restore whatever the URL hash points to (a refreshed chapter, verse,
       or other section) instead of always landing back on Home. An empty
       hash resolves to {view:'home'} via parseHash(), which is what a
       plain first visit already looks like. From here on, 'hashchange'
       (already wired above) keeps the URL and the visible view in sync,
       including for the browser's own Back/Forward buttons. */
    await goToRoute(parseHash(), { isRestore: true });

    /* a quiet "welcome back" — noticed only by someone who has actually returned */
    (function greetReturn(){
      const today = new Date().toDateString();
      const lastVisit = Storage.get('lastVisitDate', null);
      if(lastVisit && lastVisit !== today){
        setTimeout(()=> whisper('Welcome back.'), 7200);
      }
      Storage.set('lastVisitDate', today);
    })();
  }
  init();
})();
