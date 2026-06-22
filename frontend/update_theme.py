from pathlib import Path
import re

files = [Path('frontend/src/App.jsx'), Path('frontend/src/Auth.jsx')]

palette_app = '''const P = {
  deep:    "#0B3650",   // darkest — sidebar, page bg
  dark:    "#174F77",   // cards, borders
  mid:     "#2B82B7",   // accents, active states, highlights
  gold:    "#D4AF37",   // gold accent
  light:   "#E9E2C9",   // muted text, subtle elements
  white:   "#F9F5E1",   // headings, primary text
  card:    "#103850",   // card background
  border:  "#4F7B9C",   // borders
  muted:   "#AFC9D5",   // secondary text
};

const FONT = "Georgia, 'Times New Roman', serif";
const GRAD  = `linear-gradient(135deg, ${P.deep}, ${P.dark}, ${P.gold})`;
const GRAD2 = `linear-gradient(135deg, ${P.dark}, ${P.mid})`;
const GRAD_BG = `linear-gradient(160deg, #082238 0%, ${P.deep} 45%, ${P.gold} 100%)`;'''

palette_auth = '''const P = {
  deep:   "#0B3650",
  dark:   "#174F77",
  mid:    "#2B82B7",
  gold:   "#D4AF37",
  light:  "#E9E2C9",
  white:  "#F9F5E1",
  card:   "#103850",
  border: "#4F7B9C",
  muted:  "#AFC9D5",
};
const FONT = "Georgia, 'Times New Roman', serif";
const GRAD    = `linear-gradient(135deg, ${P.deep}, ${P.dark}, ${P.gold})`;
const GRAD_BG = `linear-gradient(160deg, #082238 0%, ${P.deep} 45%, ${P.gold} 100%)`;'''

replacements = [
    (re.compile(r'fontFamily\s*:\s*"Nunito, sans-serif"'), 'fontFamily: FONT'),
    (re.compile(r'fontFamily\s*=\s*"Nunito, sans-serif"'), 'fontFamily={FONT}'),
    (re.compile(r'\b#A56ABD\b'), 'P.gold'),
    (re.compile(r'\b#2A1038\b'), 'P.deep'),
    (re.compile(r'\b#49225B\b'), 'P.deep'),
    (re.compile(r'\b#080B2E\b'), 'P.dark'),
    (re.compile(r'\b#1a003388\b'), '${P.deep}88'),
    (re.compile(r'\b#E7DBEF\b'), 'P.light'),
    (re.compile(r'\b#F5EBFA\b'), 'P.white'),
    (re.compile(r'\b#3A1A4A\b'), 'P.card'),
    (re.compile(r'\b#5C2D72\b'), 'P.border'),
    (re.compile(r'\b#C4A8D4\b'), 'P.muted'),
    (re.compile(r'\b#8B4FA8\b'), 'P.dark'),
    (re.compile(r'\b#A8C8D8\b'), 'P.mid'),
    (re.compile(r'\b#2A1038\b'), 'P.deep'),
    (re.compile(r'\b#A56ABD\b'), 'P.gold'),
    (re.compile(r'accent=\"#A56ABD\"'), 'accent={P.gold}'),
]

for path in files:
    text = path.read_text(encoding='utf-8')
    if path.name == 'App.jsx':
        text = re.sub(r'const P = \{[\s\S]*?const GRAD_BG = `[^`]*`;', palette_app, text, flags=re.S)
    else:
        text = re.sub(r'const P = \{[\s\S]*?const GRAD_BG = `[^`]*`;', palette_auth, text, flags=re.S)
    for pattern, replacement in replacements:
        text = pattern.sub(replacement, text)
    text = re.sub(r"@import url\('https://fonts.googleapis.com/css2\?family=Nunito:[^']*'\);\n", '', text)
    path.write_text(text, encoding='utf-8')
    print(f'Updated {path}')
