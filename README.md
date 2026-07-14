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
