# Kanha Ji's Courtyard — Project Memory

Read this file in full before doing any work on this project. It exists so a
future Claude conversation can continue without the person needing to
re-explain anything.

---

## 1. What this project is

A personal, non-commercial, offline-first Bhagavad Gita companion web app.
Not a productivity tool. Not gamified. It exists for moments of emotional
difficulty, overwhelm, or a desire for peace — the person opens it, is asked
"How is your heart today?", and is met with a verse, a reflection, and a
quiet place to sit.

**North star, repeated because it overrides every other instinct a coding
assistant might have: peaceful, not productive.** No streaks, no badges, no
achievements, no completion percentages framed as goals, no "you're behind"
messaging. If a feature idea nudges the person to do more, it's wrong for
this app, no matter how good the engineering is.

The app covers all 18 chapters / ~700 verses of the Gita. Chapter 1
(47 verses) and Chapter 2 (72 verses) are fully written. Chapter 3 has
also been written, in a separate Claude session outside this project's
continuity — see the note at the end of §7 before treating it as verified.
Chapters 4–18 are placeholders.

---

## 2. Architecture (as of the Session 13 refactor)

The project was a single `index.html` file (HTML+CSS+JS inline) through
Session 12. Session 13 split it into the structure below **without changing
a single pixel or behavior** — every line of CSS and every line of body HTML
was moved verbatim; the only JS logic changes were (a) replacing hardcoded
chapter/verse data with a `fetch()`-based loader and (b) sourcing a handful
of default values from `config.json` instead of literals. See
`CHANGELOG.md` → Session 13 for the exact diff summary.

```
kanha-jis-courtyard/
  index.html              — structure only: HTML + <link>/<script> tags. No inline CSS or JS.
  styles.css              — all CSS, in the original cascade order (variables → layout →
                            components → animations → arrival ritual → responsive, etc.)
  app.js                  — all JS, wrapped in the same top-level IIFE as before, plus a
                            data-loading layer at the top (see §3 below)
  config.json             — app-level settings (see §3)
  data/
    chapters.json          — metadata only for all 18 chapters (number, title, subtitle, verseCount)
    chapter-01.json         — all 47 real verses for Chapter 1, full schema (see §4)
    chapter-NN.json         — (future) one file per chapter that has real content
  assets/
    audio/                 — temple.mp3, bansuri.mp3, river.mp3, banyan.mp3, village.mp3
                              (Session 20). The app only ever references these five
                              filenames; replacing a file's contents (same name) is all
                              that's needed to change what plays — no code change required.
    icons/, images/        — currently empty (see their own README.md for why)
  README_FOR_CLAUDE.md     — this file
  CHANGELOG.md             — session-by-session history
```

**This app must be served over HTTP to work**, e.g.:
```
cd kanha-jis-courtyard
python3 -m http.server 8000
# open http://localhost:8000/
```
Opening `index.html` directly via `file://` will fail to load the JSON data
files in most browsers (CORS blocks `fetch()` of local files under `file://`).
This is an inherent tradeoff of moving to real data files instead of an
inline array, and was implicit in the refactor brief that asked for this
structure. If true zero-server, double-click-to-open behavior is ever
required again, that would mean reverting to inline data — flag that
tension explicitly to the person rather than silently re-inlining anything.

---

## 3. How data loading works (`app.js`)

Near the top of `app.js`:

```js
let CONFIG = { version, appTitle, defaultTheme, defaultAmbience,
                reducedMotionDefault, defaultVolume };  // fallback mirror of config.json
let CHAPTERS = [ ...18 placeholder entries... ];         // fallback mirror of data/chapters.json
let VERSES_BY_CHAPTER = {};                              // populated per-chapter from data/chapter-NN.json
```

**As of Session 15, chapter verse data is loaded lazily, not eagerly.**
`loadContent()` (still called once from `init()`) now only:
1. Fetches `config.json` and merges it over the fallback `CONFIG`.
2. Fetches `data/chapters.json` and replaces the fallback `CHAPTERS` if it succeeds.

It no longer fetches every chapter's verse file on startup. Instead,
`loadChapterVerses(chapterNumber)` fetches `data/chapter-{NN}.json`
(zero-padded) the first time that chapter is opened, caches the result in
`VERSES_BY_CHAPTER[chapterNumber]`, and de-dupes concurrent requests for
the same chapter via an in-flight promise map (`chapterLoadPromises`).
`prefetchNextChapter(chapterNumber)` quietly warms chapter N+1 in the
background right after chapter N finishes loading — never more than one
chapter ahead, never the whole scripture. Every fetch (config, chapters
index, and per-chapter) is independently try/caught: if a file is missing,
or the page is opened without a server, the app silently falls back to its
built-in defaults / empty states — it never throws or shows a broken UI.

**Routing (also Session 15)**: the app now has real hash-based routes —
`#/home`, `#/chapters`, `#/chapter/N`, `#/chapter/N/verse/M`, and `#/<view>`
for the other top-level sections. `parseHash()` / `hashFor()` convert
between the URL hash and a route object; `setRoute(route, opts)` is what
every click calls; `goToRoute(route, opts)` is the single function that
actually renders a route, whether reached by a click, a browser
Back/Forward press, or the initial page load (`init()` now ends with
`await goToRoute(parseHash(), {isRestore:true})` instead of always
defaulting to Home). Refreshing mid-verse now fetches only that one
chapter and restores exactly that verse. Reading progress
(`{chapter, verse, ts}`) is saved to `localStorage` under `lastReading`
every time a verse is opened, and Home shows a small dismissible
"Continue your journey" card when that exists — see `renderContinueCard()`
and the `#continueCard` markup in `index.html`. None of this touches
`showView()` / `revealView()`, which are unchanged from Session 13.

`init()` (the last thing in `app.js`) is now `async` and does
`await loadContent()` before calling `renderChapters()`, `renderEmotions()`,
etc. Everything else in `init()` runs in the exact same order as before.

**Adding Chapter 2 (or any chapter) requires zero changes to `app.js` or
`index.html`.** Just:
1. Add `data/chapter-02.json` — an array of verse objects (see schema in §4).
2. Update that chapter's entry in `data/chapters.json`: real `title`,
   `subtitle`, and `verseCount` (matching the array length).

That's the entire task. `renderChapters()`, `renderVerseList()`,
`getVersesForChapter()`, and `renderVerseDetail()` already read this data
generically — none of them reference a chapter number literally.

A handful of `Storage.get(key, <literal default>)` calls were changed to
`Storage.get(key, CONFIG.<field>)` (theme default, reduced-motion default,
ambient volume default, last-ambience default). The literal values inside
the fallback `CONFIG` object above are intentionally identical to the old
literals, so behavior is unchanged whether or not `config.json` is
reachable.

---

## 4. Verse schema (per entry in a `chapter-NN.json` array)

Every verse object has this exact shape. Do not simplify or drop fields —
future chapters must match this schema exactly, since `renderVerseDetail()`
reads all of them:

```json
{
  "chapter": 1,
  "verse": 1,
  "index": "Chapter 1, Verse 1",
  "title": "Where It All Begins",
  "sanskrit": "Devanagari text, \\n-separated lines",
  "transliteration": "IAST transliteration, \\n-separated lines",
  "translation": "Plain-English rendering of the verse",
  "historicalContext": "Narrative/scholarly context",
  "teaching": "Krishna's Teaching — the doctrinal point",
  "modernReflection": "180–300 word first-person-adjacent essay connecting the verse to a modern emotional situation (see Session 12 standard)",
  "ifKanhaSatBeside": "Short, warm, second-person line — 'If Kanha Ji sat beside you today...'",
  "takeaway": "One-sentence distillation",
  "questions": ["Reflection question 1", "Reflection question 2"],
  "tags": ["short", "topic", "tags"],
  "emotions": ["emotion-ids this verse maps to, e.g. 'anxious', 'lost'"],
  "keywords": ["search keywords"],
  "related": ["Chapter X, Verse Y", "..."]
}
```

Sanskrit is the received public-domain scripture text. Every other field
(translation, historicalContext, teaching, modernReflection,
ifKanhaSatBeside, takeaway, questions, tags, emotions, keywords, related) is
written fresh for this project and must match the tone already established
in Chapter 1 — see §6.

`emotions`, `keywords`, and `related` exist in the data for every Chapter 1
verse but are **not yet consumed by any template** — mood-matching, real
search, and cross-referencing are still open future work, unrelated to the
Session 13 refactor.

---

## 5. Standing rules for every future session (do not violate without explicit instruction)

- **Never redesign.** Layout, colors, typography, animations, sounds,
  navigation behavior, reading experience, ambient effects, existing
  interactions all stay exactly as they are unless the person explicitly
  asks for a visual/UX change in that session's brief.
- **Never touch localStorage schema, routing, accessibility features,
  journal, stats, or the arrival ritual structure** without explicit
  instruction — these are load-bearing and other code depends on their
  current shape.
- **Preserve the "peaceful, not productive" north star** — reject or
  flag any feature idea (even one the person asks for) that would turn the
  app into a habit-loop, streak-tracker, or gamified product, and say so
  plainly rather than building it quietly.
- **Content sessions vs. interface sessions stay separate.** Verse content
  (writing new chapters) should not require touching `app.js` rendering
  logic, and interface sessions should not touch verse content. This
  separation is why the JSON split exists.
- **Every session ends with a changelog entry** in `CHANGELOG.md` covering:
  what was built, what changed, what remains, what comes next. Follow the
  existing format (see any past session for the pattern).
- **Verify before declaring done.** Past sessions have run a syntax check
  on the full script and diffed changed data fields against the
  pre-session version to confirm nothing outside scope was touched. Do the
  same: for interface work, byte-diff CSS/HTML that shouldn't have changed;
  for content work, diff all fields except the one being edited.

---

## 6. Voice and tone reference (for writing new verse content)

Kanha Ji's voice (used in `teaching`, `modernReflection`, `ifKanhaSatBeside`)
is warm, direct, never clinical, never preachy. It speaks to "you" personally,
connects the verse's emotional core to a specific, concrete modern situation
(career pressure, family expectations, grief, social media, loneliness,
self-worth — chosen per verse, not repeated formulaically), and never
lectures. `modernReflection` entries run 180–300 words, structured as a
personal essay rather than a summary, and never restate `translation` or
`historicalContext` — they explore the emotional "why this still matters now."
See Chapter 1's verses in `data/chapter-01.json` for 47 worked examples,
including verse 46 as the model for how to gently point toward real support
(trusted person, professional, crisis line) when a verse sits close to real
despair, without turning clinical.

---

## 7. Known open items (not this session's job, listed for continuity)

- **Chapter 2 (Sankhya Yoga, 72 verses)**: content written two sessions ago,
  `data/chapters.json` metadata fixed in the Session 14 audit (see
  CHANGELOG). Should now display correctly.
- **Chapter 3 (Karma Yoga, 43 verses in the received text)**: the person
  has reported this was written in a **separate Claude session**, outside
  this project's continuity. `data/chapters.json`'s metadata for Chapter 3
  was updated in the Session 14 audit based on the person's reported title
  and the received text's canonical verse count (43) — **but this session
  has still never actually opened `data/chapter-03.json` itself**. Its
  content has not been checked against the schema in §4, the voice/tone
  standard in §6, or the verification steps in §5, and its true array
  length has not been confirmed to actually match 43. Treat the Chapter 3
  *content* as unverified until a future session opens the file directly
  and checks it — the metadata fix only addresses why the row displayed
  "0 verses," not whether the file behind it is correct.
- **Root cause of the "0 verses" display bug (Session 14)**: `app.js` was
  not at fault — it was already fully data-driven (see §3). The actual
  cause was that `data/chapters.json` had never actually been updated on
  the live site; the file uploaded for the audit was byte-for-byte the
  original 18-placeholder version, still showing `verseCount: 0` for every
  chapter but Chapter 1. If verse counts silently reset to 0 again in the
  future, check for a stale/cached `chapters.json` being served, or the
  updated file simply not having been saved to the right path, before
  assuming `app.js` broke again.
- Chapters 4–18: not started.
- `emotions`, `keywords`, `related` fields exist in Chapter 1 data but are
  unused by any template — mood-matching from the home screen, real search,
  and cross-referencing are all still open.
- **Ambience audio (Session 20)**: `AMBIENCE_SOURCES` in `app.js` now points
  at local files in `assets/audio/` (`temple.mp3`, `bansuri.mp3`, `river.mp3`,
  `banyan.mp3`, `village.mp3`) instead of remote Freesound URLs. Whether
  actual audio files exist at those paths in the deployed project has not
  been verified this session — no filesystem access to the live
  `assets/audio/` folder was available. If a file is missing, playback
  fails silently via the existing `error` → `ambience-error` handling and
  the UI drops back to "Silent Courtyard"; nothing else breaks. Drop the
  five MP3s into `assets/audio/` (or replace any of them later) with no
  code changes needed — the filenames above are the only contract.
- **The Session 15 "Continue your journey" card on Home now has a proper
  `.continue-card` rule in `styles.css`** (added Session 16, once that file
  was available) — no more inline styles except the `display:none` toggle,
  which is controlled directly by `renderContinueCard()` in `app.js`. Not
  yet visually confirmed in a live browser across all three themes
  (Dusk/Night/Dawn), since none was available to test in.
- The Session 15 routing/lazy-loading/reading-resume work was verified by
  tracing code paths and running `node --check`, not by a live browser
  session (none was available in that session's environment). A manual
  browser smoke test — open a verse, refresh, confirm it restores; try
  Back/Forward across chapters; try an invalid `#/chapter/999` URL — is
  recommended before trusting it fully.
