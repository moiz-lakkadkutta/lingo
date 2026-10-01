"""Lingo lemma bridge: stdin {"lang": "de", "tokens": [{"w": "Warte", "si": true}, ...]} -> stdout {"version": "2.0.0", "results": [{"l": "warten", "k": true}, ...]}.
Python >= 3.10, stdlib + simplemma (pinned 2.0.0, see docs/decisions/0004-lemmatizer-and-frequency-data.md).
Sentence-initial rule mirrors simplemma's own gated initial-lowering (casing.py, GATED_INITIAL_LOWERING_LANGS = da/de/en):
a capitalised first word is looked up lowercase when the lowercase form is known and either inflects (Warte -> warten) or the
capitalised lookup learned nothing (Nein -> nein); a real noun survives because its capitalised lookup changed it (Stunden -> Stunde).
"""
import json
import sys

import simplemma
from simplemma import is_known, lemmatize

# JSON is UTF-8 on both ends regardless of the locale / PYTHONIOENCODING the caller inherited (umlauts must not crash the bridge).
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")

req = json.load(sys.stdin)
lang = req["lang"]
out = []
for t in req["tokens"]:
    w = t["w"]
    si = bool(t.get("si"))
    if not w:  # simplemma raises ValueError on an empty string; echo it as unknown instead of aborting the whole batch
        out.append({"l": w, "k": False})
        continue
    up = lemmatize(w, lang)
    low = w.lower()
    surface = w
    lemma = up
    if si and low != w and is_known(low, lang):
        ll = lemmatize(low, lang)
        if ll != low or up == w:
            lemma, surface = ll, low
    out.append({"l": lemma, "k": is_known(surface, lang)})
json.dump({"version": simplemma.__version__, "results": out}, sys.stdout, ensure_ascii=False)
