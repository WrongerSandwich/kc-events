#!/usr/bin/env bash
# Regenerates the site's committed font files in src/fonts/ from the fontsource packages (#195; audit 2026-10-21, A10).
# Run from site/ after a fontsource bump or a change to what the display face sets; needs Python 3 with fonttools and brotli
# (`pip install fonttools brotli`). The build itself never runs it.
#
# - Geist: each subset's wght axis limited to 400 to 600, the weights the site sets (tokens.css). Geist's licence
#   (SIL OFL 1.1) names no Reserved Font Name, so the instanced files keep their name.
# - Josefin Sans: the display face (#293), which sets the site's name, its own headings and its small labels, always
#   in capitals (text-transform), so the cut holds capitals, figures and punctuation and no lower case. Its OFL
#   reserves the name "Josefin Sans", and a subset is a Modified Version, so the subset is renamed "KC Display"
#   (tokens.css asks for that).
#
# The licences ship beside the files, in src/fonts/LICENSE-*.txt.
set -euo pipefail

# What the display face sets: capitals (the site's name among them; a test holds it in), the accented capitals a
# venue's name may carry (Café, Salón), figures for a heading's or a label's date, and the punctuation those carry.
# A character outside it falls to Geist.
DISPLAY="ABCDEFGHIJKLMNOPQRSTUVWXYZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝ0123456789 &',.:;!?()/+-–—’‘“”·@|#%*"

geist=node_modules/@fontsource-variable/geist
josefin=node_modules/@fontsource/josefin-sans
out=src/fonts

mkdir -p "$out"
for subset in latin latin-ext cyrillic cyrillic-ext vietnamese; do
  python3 -I -m fontTools.varLib.instancer -q "$geist/files/geist-$subset-wght-normal.woff2" wght=400:600 --no-recalc-timestamp \
    -o "$out/geist-$subset-wght-400-600.woff2"
done

python3 -I -m fontTools.subset "$josefin/files/josefin-sans-latin-700-normal.woff2" --text="$DISPLAY" \
  --flavor=woff2 --layout-features=kern --name-IDs="*" --no-hinting --desubroutinize --output-file="$out/display-700.woff2"

python3 -I - "$out/display-700.woff2" <<'PY'
import sys
from fontTools.ttLib import TTFont

path = sys.argv[1]
font = TTFont(path, recalcTimestamp=False)
names = {1: "KC Display", 2: "Bold", 3: "KC Display Bold 2.001", 4: "KC Display Bold", 6: "KCDisplay-Bold", 16: "KC Display", 17: "Bold"}
name = font["name"]
for record in list(name.names):
    if record.nameID in names:
        name.setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
font.save(path)
PY

cp "$geist/LICENSE" "$out/LICENSE-geist.txt"
cp "$josefin/LICENSE" "$out/LICENSE-josefin-sans.txt"
ls -l "$out"
