# Kanha Ji's Courtyard

A personal, non-commercial Bhagavad Gita companion — a quiet place to read a
verse when things feel hard. No streaks, no badges, no "keep your habit
going" pressure. Just the Gita, a warm courtyard, and Kanha Ji.

This is a static website (plain HTML/CSS/JavaScript, no build tools) hosted
on GitHub Pages. As of Session 23 it's also an installable, offline-first
Progressive Web App — once you've visited it over HTTPS, you can add it to
your home screen, and it keeps working (including whatever chapters and
ambience sounds you've already opened) without an internet connection.

---

## Installing / offline use

- Open the site once, over a real internet connection.
- Your browser will offer to **install** it, or use the "Install the
  Courtyard" row under Settings.
- After that, opening it from your home screen launches full-screen, no
  browser bar.
- Any chapter you've read once, and any ambience sound you've played once,
  keeps working without internet from then on.
- If you're offline, you'll see a quiet note instead of a browser error;
  when a new version of the site is deployed, a small banner offers to
  refresh whenever you're ready — nothing updates without you tapping it.

**How updates reach your device:** the app uses a smarter update flow so
new deployments show up promptly instead of getting stuck behind an old
cache. Every launch checks GitHub for a newer Service Worker automatically.
The app shell (the page itself, its styling, and its behavior) uses a
`networkFirst` strategy: while you're online, it always fetches the latest
deployed version and quietly keeps a copy for later; if you happen to open
the app without a connection, it falls back to that last cached copy so
nothing breaks. Chapters and ambience sounds still work the way they
always have — cached the first time you open them, so they're available
offline from then on. The end result is that a newly deployed feature (a
new chapter, a fix, a small improvement) should appear the next time you
open the app with a connection, without you ever needing to manually clear
your cache.

---

## Your Journal, and backing it up

The Journal is private by design: entries are written to this device only,
never uploaded, never synced to any account, never tracked. There's no
sign-in anywhere in the Courtyard, and the Journal doesn't change that.

Because entries live only in this browser's local storage, clearing your
site data — or moving to a new phone or computer — will lose them, with no
way to recover them from anywhere else. To make that a choice rather than
an accident, Settings has a **Your Journal** section:

- **Export Journal** downloads every entry, with its original timestamp, as
  a single file named like `kanha-ji-journal-2026-07-15.json`. Keep it
  wherever you'd keep any personal file — this app never sees it again
  unless you bring it back.
- **Import Journal** lets you choose a previously exported file and restore
  it. You'll be asked to confirm first, since importing replaces whatever
  journal is currently on this device. If the file isn't a valid Courtyard
  backup, you'll see a plain explanation instead of an error — nothing
  breaks, and nothing on the device changes.

If you haven't written anything yet, Export stays disabled with a note
that there's nothing to export.

This is a manual, one-file, one-device-to-another process — there is no
automatic sync, no cloud storage, and no account behind it. That's
intentional.

---

## Navigation, and the About page

The header (brand mark, nav links) stays fixed at the top of the screen as
you scroll — it was already built this way (a `position: sticky` header)
— and now stays visible on every screen, including while reading a single
verse. Only the sound control recedes there, so the reading itself still
gets the quiet, uncluttered focus that was intended; the way back to the
rest of the Courtyard never disappears now, since readers move between
Chapters, Journal, Search, and everywhere else often enough mid-read that
hiding the nav there was more friction than atmosphere.

**About** is a new entry in that nav, alongside Home, Chapters, Search,
Collections, Journal, Meditation, Journey, and Settings. It's a read-only
page — no Storage, no settings to change — split into a few quiet sections,
meant to read like chapters of the same book rather than a settings screen:

- **Application** — app name, the current version (read live from
  `config.json`, so it never needs hand-editing here when the version
  bumps), and who made it.
- **About this Project** — a short, plain explanation that the Courtyard
  is a companion to the Gita, not a replacement for it.
- **A Small Note** — a brief, warm reminder that the Gita itself is the
  point; the Courtyard is only one more quiet place to sit with it, and
  is glad to be left behind the moment someone picks up the original.
- **Copyright & Attribution** — the original Sanskrit verses and public-
  domain translations remain part of the scripture's own heritage. The
  reflections, modern interpretations, historical/contextual commentary,
  "If Kanha Ji sat beside you today…" passages, reflection questions,
  journal prompts, the Courtyard's own concept, experience, UI, and
  original writing are original work, © ThatBrownCraft. Written warmly,
  not like legal boilerplate — see `index.html`'s `#view-about` if you
  want the exact wording.
- **Privacy** — a one-line reminder of what's already true elsewhere in
  this README: journal entries stay on-device and are never uploaded,
  tracked, or shared unless you export them yourself.
- **Credits**, and a closing signoff at the bottom of the page — a short
  farewell, a "Made with 🤎" signature, and one last, smaller line
  underneath it, meant to feel like the quiet last page of a book rather
  than a settings screen or a piece of documentation.

Nothing about routing, caching, or offline support changed to add this —
About is just another `KNOWN_SIMPLE_VIEWS` entry, same as Journal or
Settings, and its markup, styling, and file list were already precached
by the existing service worker.

---

## Adding ambience sounds (no coding needed)

The Courtyard plays soft background ambience — temple bells, a flute, a
river — that you can pick from a small menu. Adding a new one is fully
automatic:

1. Go to the `assets/audio/` folder in this repository.
2. Click **Add file → Upload files**, and upload your new `.mp3`.
3. Click **Commit changes**.

That's it. Within a minute or two:
- A GitHub Action automatically updates `assets/audio/audio.json` (the file
  that tells the app which ambiences exist).
- GitHub Pages redeploys the site.
- Your new ambience appears in the app's sound menu, ready to play.

You never need to write or edit any code for this. If you want a nicer
display name than the one guessed from your filename (e.g. you uploaded
`govindam_adi_purusham.mp3` and want it to read "Govindam Adi Purusham"
exactly), open `assets/audio/audio.json` afterward and edit the `"name"`
text for that entry — everything else can stay untouched.

**Removing** an ambience works the same way in reverse: delete the MP3 from
`assets/audio/`, commit, and it disappears from the menu on its own.

**Replacing** one: upload a new file with the exact same name as the one
you're replacing (e.g. a new `river.mp3` over the old one) — no manifest
change needed at all.

---

## Project structure

```
kanha-jis-courtyard/
  .github/workflows/
    audio-manifest.yml     — auto-updates the ambience menu (see above)
  index.html               — page structure
  styles.css               — all visual styling
  app.js                   — all app behavior
  config.json              — app-level settings
  manifest.webmanifest     — PWA install metadata (name, icons, colors)
  service-worker.js        — offline caching (app shell, chapters, ambience)
  pwa.js                   — install prompt + offline/update banners
  data/
    chapters.json          — list of all 18 chapters
    chapter-01.json, ...   — verse content, one file per chapter
  assets/
    audio/                 — ⭐ drop new ambience MP3s here
      audio.json           — auto-generated list of ambiences (don't hand-edit)
      generate_audio_manifest.py — the script the GitHub Action runs for you
    icons/                 — PWA icon set (diya glyph, several sizes)
    images/                — reserved for future use
```

---

## Running this locally

Because the app loads its content from JSON files, it needs to be served
over a real (even if local) web server — opening `index.html` by
double-clicking it won't work in most browsers.

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

---

## For future Claude sessions

See `README_FOR_CLAUDE.md` for the full project history, architecture
decisions, and standing rules — that file is written for an AI assistant
picking up work on this project, not for a human reader.
