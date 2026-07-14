#!/usr/bin/env python3
"""
generate_audio_manifest.py — regenerates assets/audio/audio.json from
whatever .mp3 files actually sit in assets/audio/.

Why this exists (read this if you're wondering why it's not automatic):
GitHub Pages is static file hosting — it serves whatever files you commit,
verbatim, with no server-side code running. There is nowhere for a script
to "notice" a new upload and react to it on its own. Something has to
actually run this script and produce a new audio.json before you commit.
This is the simplest possible version of that "something": run it once
on your own machine, right before you commit and push.

What it does:
  1. Looks at every .mp3 file directly inside assets/audio/.
  2. If audio.json already exists, keeps each existing entry's "name" —
     so ambiences you've already named nicely (e.g. "Krishna's Flute")
     never get silently renamed just for being scanned again.
  3. Any .mp3 that's new since the last run gets added with a guessed
     display name (its filename, underscores/dashes turned to spaces,
     title-cased) — e.g. "govindam_adi_purusham.mp3" -> "Govindam Adi
     Purusham". You never have to run this by hand for the file to show
     up in the app, but you can always open audio.json afterward and
     tidy up a guessed name if you want something more elegant.
  4. Any entry whose .mp3 no longer exists in the folder is dropped, so
     audio.json never points at a file that isn't there anymore.
  5. Writes the result back to assets/audio/audio.json, pretty-printed,
     in the same order the ambience buttons will appear in the app.

Usage:
  cd assets/audio
  python3 generate_audio_manifest.py

  (or, from the project root: python3 assets/audio/generate_audio_manifest.py)

No dependencies beyond Python 3's standard library — the same Python 3
you're already using to run `python3 -m http.server` locally.
"""
import json
import re
from pathlib import Path

AUDIO_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = AUDIO_DIR / 'audio.json'


def guess_name(filename_stem):
    """Turn 'govindam_adi_purusham' or 'madhur-ashtakam' into a readable
    title-cased guess. This is only ever used for a file audio.json has
    never seen before — existing names are always preserved as-is."""
    words = re.split(r'[_\-\s]+', filename_stem.strip())
    return ' '.join(w.capitalize() for w in words if w)


def load_existing_manifest():
    if not MANIFEST_PATH.exists():
        return []
    try:
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        print(f'Warning: could not read existing {MANIFEST_PATH.name} '
              f'(starting fresh instead of failing).')
        return []


def main():
    mp3_files = sorted(p.name for p in AUDIO_DIR.glob('*.mp3'))
    existing = load_existing_manifest()
    existing_by_file = {entry.get('file'): entry for entry in existing if entry.get('file')}

    new_manifest = []
    added, kept, removed = [], [], []

    # keep existing entries, in their existing order, as long as the file is still there
    for entry in existing:
        f = entry.get('file')
        if f in mp3_files:
            new_manifest.append({'name': entry.get('name') or guess_name(Path(f).stem), 'file': f})
            kept.append(f)
        elif f:
            removed.append(f)

    # append anything new that wasn't in the manifest before
    kept_files = {e['file'] for e in new_manifest}
    for f in mp3_files:
        if f not in kept_files:
            name = guess_name(Path(f).stem)
            new_manifest.append({'name': name, 'file': f})
            added.append((f, name))

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as out:
        json.dump(new_manifest, out, indent=2, ensure_ascii=False)
        out.write('\n')

    print(f'Wrote {MANIFEST_PATH} with {len(new_manifest)} ambience(s).')
    if added:
        print('\nAdded (guessed names — edit audio.json if you want nicer ones):')
        for f, name in added:
            print(f'  + {f}  ->  "{name}"')
    if removed:
        print('\nRemoved (file no longer in assets/audio/):')
        for f in removed:
            print(f'  - {f}')
    if not added and not removed:
        print('No changes — manifest already matches the files in this folder.')


if __name__ == '__main__':
    main()
