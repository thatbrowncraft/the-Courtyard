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
     CONFIG mirrors config.json. data/chapters.json is now only a lightweight
     manifest — an ordered array of chapter filenames — with no title,
     subtitle, or verse count of its own. Each data/chapter-NN.json is the
     single source of truth for its own metadata (id, title, subtitle) and
     its verses array; CHAPTERS (title/subtitle/verseCount for rendering) is
     built entirely from what those files report, and verseCount is always
     `verses.length` — never a separately stored number, so it can never
     drift out of sync with the actual content.
     The literals below are fallback defaults only — used if a fetch fails
     (e.g. opened without a local server) — so behavior is identical to
     before even without a network layer. Adding a new chapter never
     requires touching this file: add data/chapter-NN.json (with its own
     id/title/subtitle/verses) and list its filename in data/chapters.json. */
  let CONFIG = {
    version: '2.0.0',
    appTitle: "Kanha Ji's Courtyard",
    defaultTheme: 'dusk',
    defaultAmbience: null,
    reducedMotionDefault: false,
    defaultVolume: 0.45
  };
  // Fallback manifest, used only if data/chapters.json itself can't be fetched.
  const FALLBACK_MANIFEST = Array.from({length:18}, (_,i)=>`chapter-${String(i+1).padStart(2,'0')}.json`);
  let CHAPTERS = [];
  let VERSES_BY_CHAPTER = {};

  async function fetchJSON(path){
    const res = await fetch(path);
    if(!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.json();
  }

  async function loadContent(){
    try{
      const config = await fetchJSON('config.json');
      CONFIG = Object.assign({}, CONFIG, config);
    }catch(e){ /* keep fallback CONFIG */ }

    if(CONFIG.appTitle) document.title = CONFIG.appTitle;

    let manifest = FALLBACK_MANIFEST;
    try{
      const fetched = await fetchJSON('data/chapters.json');
      if(Array.isArray(fetched) && fetched.length) manifest = fetched;
    }catch(e){ /* keep fallback manifest */ }

    // For each filename in the manifest, load the chapter file and derive
    // everything CHAPTERS/VERSES_BY_CHAPTER need from its own contents.
    // A chapter that hasn't been written yet (file missing, or unreachable)
    // falls back to a placeholder row — same as before — using its position
    // in the manifest as the chapter number.
    CHAPTERS = await Promise.all(manifest.map(async (filename, i)=>{
      const positionalNumber = i+1;
      try{
        const chapter = await fetchJSON(`data/${filename}`);
        const verses = Array.isArray(chapter.verses) ? chapter.verses : [];
        const number = chapter.id != null ? chapter.id : positionalNumber;
        if(verses.length) VERSES_BY_CHAPTER[number] = verses;
        return {
          number,
          title: chapter.title || `Chapter ${number}`,
          subtitle: chapter.subtitle || 'Placeholder chapter — verses added later',
          verseCount: verses.length // always derived, never stored
        };
      }catch(e){
        return {
          number: positionalNumber,
          title: `Chapter ${positionalNumber}`,
          subtitle: 'Placeholder chapter — verses added later',
          verseCount: 0
        };
      }
    }));
  }

  function getVersesForChapter(chapterNumber){
    return VERSES_BY_CHAPTER[chapterNumber] || [];
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
    // reading mode: opening a verse hides everything but the back button and the verse itself
    document.body.classList.toggle('reading-mode', id === 'verse');
  }

  document.body.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-view]');
    if(btn) showView(btn.dataset.view);
  });

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

  function renderChapters(){
    const list = document.getElementById('chapterList');
    list.innerHTML = CHAPTERS.map(ch => `
      <div class="chapter-row" data-chapter="${ch.number}" tabindex="0" role="button" aria-label="${ch.title}">
        <span class="chapter-num" aria-hidden="true">${String(ch.number).padStart(2,'0')}</span>
        <span class="chapter-info">
          <span class="chapter-title">${ch.title}</span>
          <span class="chapter-sub">${ch.subtitle}</span>
        </span>
        <span class="chapter-count">${ch.verseCount} verses</span>
      </div>
    `).join('');
  }

  // Opens the verse list for a given chapter. Does NOT open any verse detail —
  // that only happens when a verse row itself is clicked.
  function openChapter(chapterNumber){
    const ch = CHAPTERS.find(c => c.number === chapterNumber);
    if(!ch) return;
    currentChapterNumber = chapterNumber;
    renderVerseList(ch);
    showView('verses');
  }

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

  function openVerse(verseNumber){
    const verses = getVersesForChapter(currentChapterNumber);
    const v = verses.find(item => item.verse === verseNumber);
    if(!v) return;
    renderVerseDetail(v);
    showView('verse');
    const visited = Storage.get('versesVisited', 0);
    Storage.set('versesVisited', visited + 1);
    tuneDiya();
    whisper('Take your time.');
  }

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

  document.getElementById('chapterList')?.addEventListener('click', (e)=>{
    const row = e.target.closest('.chapter-row');
    if(row) openChapter(Number(row.dataset.chapter));
  });
  document.getElementById('chapterList')?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){
      const row = e.target.closest('.chapter-row');
      if(row){ e.preventDefault(); openChapter(Number(row.dataset.chapter)); }
    }
  });

  document.getElementById('verseList')?.addEventListener('click', (e)=>{
    const row = e.target.closest('.chapter-row');
    if(row) openVerse(Number(row.dataset.verse));
  });
  document.getElementById('verseList')?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){
      const row = e.target.closest('.chapter-row');
      if(row){ e.preventDefault(); openVerse(Number(row.dataset.verse)); }
    }
  });

  document.getElementById('backToChapters').addEventListener('click', ()=> showView('chapters'));
  document.getElementById('backToVerses').addEventListener('click', ()=>{
    if(currentChapterNumber === null){ showView('chapters'); return; }
    const ch = CHAPTERS.find(c => c.number === currentChapterNumber);
    if(ch) renderVerseList(ch);
    showView('verses');
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
    tuneDiya();
    whisper("I'll keep this here for you.");
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
      renderJournal();
      renderStats();
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

  /* ---------------- ambient sound: real recorded ambience, never autoplay ----------------
     Five audio options. Each is a real field recording (not synthesized), sourced
     from Freesound under a CC0 or CC-BY license — credits below. Files are lazy:
     nothing is fetched until a person actually picks an ambience, and only one
     ever plays at once. Switching crossfades over ~2 seconds; volume ramps smoothly.

     NOTE for next session: "Krishna's Flute" still has no source wired in.
     Searched again this session specifically for a genuine, seamlessly-loopable,
     clearly-licensed bansuri recording — still no confident match. What turns up
     is either a bare tuning scale (not a real ambient performance), a different
     instrument entirely, or unclear/unverifiable licensing. Rather than wire in
     something that might not actually be what it claims to be, the slot stays
     empty. Clicking it now surfaces a soft in-world message instead of doing
     nothing (see the click handler below), so it no longer feels like a dead
     button — but it still isn't the real thing. Drop a verified, licensed,
     loopable bansuri file's URL into AMBIENCE_SOURCES.flute.url to finish it. */
  const AMBIENCE_SOURCES = {
    flute:   { url: '', credit: null },
    temple:  { url: 'https://cdn.freesound.org/previews/466/466652_9226170-lq.mp3', credit: 'temple bell, recorded in Himachal Pradesh, India — ganiket on Freesound, CC0' },
    river:   { url: 'https://cdn.freesound.org/previews/39/39831_28216-lq.mp3', credit: 'river water — Arctura on Freesound, CC BY 3.0' },
    wind:    { url: 'https://cdn.freesound.org/previews/360/360568_501389-lq.mp3', credit: 'wind moving through trees — jordir on Freesound, CC0' },
    insects: { url: 'https://cdn.freesound.org/previews/320/320145_140737-lq.mp3', credit: 'night crickets, rural Australia — OwlStorm on Freesound, CC0' }
  };
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
      if(!source || !source.url) return; // no verified recording for this ambience yet
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
  const lastAmbience = Storage.get('lastAmbience', CONFIG.defaultAmbience);
  if(lastAmbience) setActiveAmbienceUI(lastAmbience);

  soundToggle.addEventListener('click', ()=>{
    const expanded = soundToggle.getAttribute('aria-expanded') === 'true';
    soundToggle.setAttribute('aria-expanded', String(!expanded));
    soundPanel.classList.toggle('open', !expanded);
  });
  document.querySelectorAll('#soundPanel [data-sound]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const type = btn.dataset.sound;
      const source = AMBIENCE_SOURCES[type];
      if(!source || !source.url){
        // no verified recording sits behind this one yet — say so gently rather than doing nothing
        whisper('This ambience is still finding its voice.');
        return;
      }
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

  const soundVolume = document.getElementById('soundVolume');
  soundVolume.value = Math.round(SoundScape.getVolume() * 100);
  soundVolume.addEventListener('input', ()=>{
    SoundScape.setVolume(soundVolume.value / 100);
  });

  /* ---------------- init ----------------
     Content (config/chapters/verses) is fetched before the app renders anything
     that depends on it. This is the only behavioral change the data-driven
     architecture requires: chapter/verse rendering now waits one microtask
     for local JSON instead of reading a hardcoded array — visually identical,
     since nothing else in the app depends on that data being ready sooner. */
  async function init(){
    await loadContent();
    runArrival();
    initStars();
    renderEmotions();
    renderChapters();
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
