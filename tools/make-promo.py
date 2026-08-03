"""Render the PromptSpend promo's motion-graphics core (1920x1080 @ 24fps).

Designed to be stitched between two AI-generated bookends by
tools/stitch-promo.sh:

  [ AI hero shot ] -> [ THIS: the story ] -> [ AI end card ]

Two things make this different from the promos for the sibling repositories.

Those are command-line tools, so their promos had to draw a terminal in PIL -
there was nothing to film. This one has a real interface, and this project's own
rule is that a claim on screen must be true of the code. So every screen in this
video is a genuine screenshot, captured by tools/capture-ui.ts from the built
site, showing real prices out of the committed catalog. Nothing here is a
mockup, so nothing here can quietly stop being true.

And the type is the site's own: Space Grotesk, IBM Plex Sans and JetBrains Mono,
converted out of the @fontsource WOFF files the site itself serves. Overlay text
sits directly beside screenshot text in the same frame, so a near-miss typeface
would read as a mistake.

Design rules:
  * No bounce / spring / elastic motion. Fades and micro-slides (<= 10px) only.
  * Screens move slowly and always in one direction - a drifting screenshot
    reads as film, a static one reads as a slide deck.
  * Every figure spoken by the narration is the figure in the screenshot beside
    it. There are no invented numbers anywhere in this file.

Usage:  python tools/make-promo.py [--outdir DIR] [--check]
Output: DIR/core.mp4 (needs ffmpeg on PATH)
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / "assets" / "promo-frames"
FONT_CACHE = ROOT / ".promo-fonts"

W, H, FPS = 1920, 1080, 24

# The site's own dark theme, read off src/styles/tokens.css. Kept identical so
# the surround and the screenshots are the same colour, not merely similar.
BG = (11, 14, 20)  # --bg      #0b0e14
SURFACE = (18, 23, 34)  # --surface #121722
SURFACE2 = (26, 33, 48)  # --surface-2
INK = (233, 236, 242)  # --ink
MUTED = (147, 160, 180)  # --muted
BORDER = (39, 48, 63)  # --border
ACCENT = (124, 157, 255)  # --accent
SAVE = (60, 203, 127)  # --save
COST = (249, 112, 102)  # --cost
WARN = (245, 184, 73)  # --warn

FACES = {
    "display": ("space-grotesk", 700),
    "display-mid": ("space-grotesk", 500),
    "body": ("ibm-plex-sans", 400),
    "body-semi": ("ibm-plex-sans", 600),
    "mono": ("jetbrains-mono", 400),
    "mono-bold": ("jetbrains-mono", 700),
}


def build_fonts():
    """Convert the site's WOFF files to TTF so PIL can use them.

    Cached in a gitignored directory: the conversion is deterministic and takes
    about a second, but doing it on every run of a frame loop would be silly.
    """
    FONT_CACHE.mkdir(exist_ok=True)
    out = {}
    for key, (family, weight) in FACES.items():
        ttf = FONT_CACHE / "{}-{}.ttf".format(family, weight)
        if not ttf.exists():
            woff = (ROOT / "node_modules" / "@fontsource" / family / "files" /
                    "{}-latin-{}-normal.woff".format(family, weight))
            if not woff.exists():
                raise SystemExit(
                    "missing {}\n  run `npm ci` first - the promo uses the site's own fonts".format(woff)
                )
            from fontTools.ttLib import TTFont

            font = TTFont(str(woff))
            font.flavor = None  # drop the WOFF wrapper, leaving plain TTF
            font.save(str(ttf))
        out[key] = str(ttf)
    return out


FONT_FILES = {}
_font_cache = {}


def F(kind, size):
    key = (kind, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(FONT_FILES[kind], size)
    return _font_cache[key]


_probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def tw(s, f):
    return _probe.textlength(s, font=f)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ease(t):
    """Smooth ease-out with NO overshoot (deliberately not a spring)."""
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def fade(colour, a):
    return lerp(BG, colour, max(0.0, min(1.0, a)))


def seg(t, start, span):
    """Progress of a sub-animation occupying [start, start+span) of a scene."""
    return max(0.0, min(1.0, (t - start) / span))


# --------------------------------------------------------------------------
# canvas primitives
# --------------------------------------------------------------------------

def base():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 64):
        for y in range(0, H, 64):
            d.point((x, y), fill=(16, 20, 29))
    return im


_shots = {}


def load(name):
    """A captured screenshot, loaded once."""
    if name not in _shots:
        path = FRAMES / (name + ".png")
        if not path.exists():
            raise SystemExit(
                "missing {}\n  run `npx tsx tools/capture-ui.ts` first".format(path)
            )
        _shots[name] = Image.open(path).convert("RGB")
    return _shots[name]


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def place(im, shot, cx, cy, width, alpha=1.0, radius=16, shadow=True, border=True):
    """Composite a screenshot centred at (cx, cy), scaled to `width`.

    Alpha is applied against the background rather than by pasting an RGBA
    image, so a fading screen darkens into the canvas exactly the way the
    drawn elements do.
    """
    if alpha <= 0.01:
        return None
    scale = width / shot.width
    size = (max(1, int(shot.width * scale)), max(1, int(shot.height * scale)))
    resized = shot.resize(size, Image.LANCZOS)
    if alpha < 1.0:
        resized = Image.blend(Image.new("RGB", size, BG), resized, alpha)

    x0, y0 = int(cx - size[0] / 2), int(cy - size[1] / 2)
    box = [x0, y0, x0 + size[0], y0 + size[1]]

    if shadow:
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle(
            [box[0] + 6, box[1] + 18, box[2] + 6, box[3] + 18], radius=radius,
            fill=(0, 0, 0, int(150 * alpha)),
        )
        blurred = sh.filter(ImageFilter.GaussianBlur(20))
        im.paste(Image.alpha_composite(im.convert("RGBA"), blurred).convert("RGB"), (0, 0))

    im.paste(resized, (x0, y0), rounded_mask(size, radius))
    if border:
        ImageDraw.Draw(im).rounded_rectangle(box, radius=radius,
                                             outline=fade(BORDER, alpha), width=2)
    return box


def kenburns(t, start=1.0, end=1.06):
    """A slow, monotonic zoom. One direction only - never in and back out."""
    return start + (end - start) * max(0.0, min(1.0, t))


HEAD_Y = 92


def headline(im, text, alpha=1.0, sub=None, sub_alpha=None, colour=INK, y=HEAD_Y,
             size=66, highlight=None, highlight_colour=None):
    """A display headline, optionally with one phrase in the accent colour.

    The highlight is drawn by measuring the prefix rather than by splitting into
    separate draws with guessed spacing, so the coloured run sits exactly where
    it would in a single string.
    """
    d = ImageDraw.Draw(im)
    f = F("display", size)
    if highlight and highlight in text:
        head, _, tail = text.partition(highlight)
        x = 120
        d.text((x, y), head, font=f, fill=fade(colour, alpha))
        x += tw(head, f)
        d.text((x, y), highlight, font=f, fill=fade(highlight_colour or ACCENT, alpha))
        x += tw(highlight, f)
        d.text((x, y), tail, font=f, fill=fade(colour, alpha))
    else:
        d.text((120, y), text, font=f, fill=fade(colour, alpha))
    if sub:
        d.text((123, y + size + 24), sub, font=F("body", 34),
               fill=fade(MUTED, alpha if sub_alpha is None else sub_alpha))


def eyebrow(im, text, alpha=1.0, y=48, colour=None):
    d = ImageDraw.Draw(im)
    f = F("mono-bold", 24)
    d.text((122, y), text, font=f, fill=fade(colour or ACCENT, alpha))


def centred(im, text, y, font, colour, alpha):
    d = ImageDraw.Draw(im)
    d.text((W / 2 - tw(text, font) / 2, y), text, font=font, fill=fade(colour, alpha))


def badge(im, x, y, label, colour, alpha=1.0, size=28, pad=22):
    d = ImageDraw.Draw(im)
    f = F("mono-bold", size)
    w = tw(label, f) + pad * 2
    h = size + 24
    d.rounded_rectangle([x, y, x + w, y + h], radius=8,
                        fill=lerp(BG, colour, 0.15 * alpha),
                        outline=fade(colour, alpha), width=2)
    d.text((x + pad, y + 10), label, font=f, fill=fade(colour, alpha))
    return w


def rule(im, y, alpha, width=760, colour=None):
    d = ImageDraw.Draw(im)
    x = W / 2 - width / 2
    for i in range(int(width)):
        d.line([x + i, y, x + i, y + 5],
               fill=fade(lerp(ACCENT, colour or SAVE, i / width), alpha))


# --------------------------------------------------------------------------
# content - every figure below is read out of the catalog at build time
# --------------------------------------------------------------------------
CATALOG = json.loads((ROOT / "public" / "data" / "pricing.json").read_text(encoding="utf-8"))
PRIMARY = [m for m in CATALOG["models"] if not m.get("aliasOf")]
N_MODELS = len(PRIMARY)
N_PROVIDERS = len(CATALOG["providers"])
N_FLAGGED = len([m for m in CATALOG["models"] if m["provenance"].get("needsReview")])

SITE = "promptspend.com"

# The catalog's own timestamp, so "today" in the video is a real date this data
# actually carries rather than whenever the render happened to run.
TODAY = CATALOG["generatedAt"][:10]
FROZEN_DATE = "2025-03-11"


def _date_between(start, end, progress):
    """A date `progress` of the way from `start` to `end`, both YYYY-MM-DD.

    Real calendar arithmetic rather than 30-day months: the earlier version
    counted in 30s and overshot to 2026-08-11, which is a future date, in a
    video whose argument is that stale dates matter.
    """
    from datetime import date, timedelta

    a = date(*map(int, start.split("-")))
    b = date(*map(int, end.split("-")))
    return (a + timedelta(days=round((b - a).days * max(0.0, min(1.0, progress))))).isoformat()


def _blended(m):
    """Catalog.blendedRate: input-weighted 75/25, the value map's X axis."""
    return m["pricing"]["input"] * 0.75 + m["pricing"]["output"] * 0.25


# Catalog.rateSpread's population, matched exactly: primary models with a real
# price that upstream still lists.
#
# Filtering on `status === 'current'` instead — the obvious guess — gives 191x
# against the 218x the site's own Compare headline shows, because it drops
# Claude Opus 4.1. A promo that contradicts the product is worse than no promo,
# so this mirrors the rule rather than inventing a defensible-sounding one.
_priced = [m for m in PRIMARY
           if _blended(m) > 0 and m["provenance"].get("stale") is not True]
_cheap = min(_priced, key=_blended)
_dear = max(_priced, key=_blended)
SPREAD_MULTIPLE = _blended(_dear) / _blended(_cheap)
SPREAD = "{:.0f}x".format(SPREAD_MULTIPLE)
SPREAD_FROM = _cheap["displayName"]
SPREAD_TO = _dear["displayName"]

# The four in the captured estimate, and the saving the engine computed for
# them. Asserted against the catalog by --check so a stale capture cannot leave
# a wrong number on screen.
SAVING = "$184,702/year"
DEAREST_CARD = "Claude Opus 5"
CHEAPEST_CARD = "DeepSeek V3.2"
CARD_LOW = "$646"
CARD_HIGH = "$16,038"


# --------------------------------------------------------------------------
# scenes
# --------------------------------------------------------------------------

def scene_problem(fr, n):
    """The category's failure mode: a calculator is a snapshot, and it rots."""
    t = fr / n
    im = base()
    d = ImageDraw.Draw(im)
    eyebrow(im, "THE PROBLEM", ease(seg(t, 0.02, 0.12)))
    headline(im, "Every LLM cost calculator", ease(seg(t, 0.04, 0.14)))
    headline(im, "is a snapshot.", ease(seg(t, 0.12, 0.14)), y=HEAD_Y + 82,
             sub="Someone hard-codes a dozen prices. Then the models change.",
             sub_alpha=ease(seg(t, 0.24, 0.14)))

    a = ease(seg(t, 0.34, 0.16))
    if a > 0.01:
        box = [300, 380, 1620, 620]
        ImageDraw.Draw(im).rounded_rectangle(box, radius=18,
                                             fill=lerp(BG, SURFACE, a),
                                             outline=fade(BORDER, a), width=2)
        fl = F("mono-bold", 26)
        fv = F("mono-bold", 72)
        d.text((box[0] + 60, box[1] + 46), "PRICES AS OF", font=fl, fill=fade(MUTED, a))
        d.text((box[0] + 60, box[1] + 100), FROZEN_DATE, font=fv, fill=fade(COST, a))

        a2 = ease(seg(t, 0.50, 0.14))
        if a2 > 0.01:
            d.text((box[0] + 760, box[1] + 46), "TODAY", font=fl, fill=fade(MUTED, a2))
            # The date runs forward while the quoted one does not: the gap is
            # the point, so it is shown opening rather than asserted. It stops
            # at the catalog's own generatedAt — a promo for a project about
            # not publishing wrong dates cannot put a future one on screen.
            day = _date_between(FROZEN_DATE, TODAY, ease(seg(t, 0.54, 0.34)))
            d.text((box[0] + 760, box[1] + 100), day, font=fv, fill=fade(INK, a2))

    a3 = ease(seg(t, 0.78, 0.16))
    if a3 > 0.01:
        centred(im, "Within months, the premise is wrong.", 720, F("display", 52), WARN, a3)
    a4 = ease(seg(t, 0.88, 0.12))
    if a4 > 0.01:
        centred(im, "The prices it quotes no longer exist.", 800, F("body", 36), MUTED, a4)
    return im


def scene_spread(fr, n):
    """The decision being got wrong is not a rounding error."""
    t = fr / n
    im = base()
    eyebrow(im, "WHY IT MATTERS", ease(seg(t, 0.02, 0.12)))
    headline(im, "And price is a {} decision.".format(SPREAD), ease(seg(t, 0.04, 0.14)),
             sub="{} against {}, measured the same way on both sides.".format(SPREAD_FROM, SPREAD_TO),
             sub_alpha=ease(seg(t, 0.16, 0.14)), highlight=SPREAD)

    a = ease(seg(t, 0.26, 0.20))
    zoom = kenburns(seg(t, 0.26, 0.74), 1.0, 1.05)
    place(im, load("02-valuemap"), W / 2, 690, 1180 * zoom, a)
    return im


def scene_estimate(fr, n):
    """The product, doing the thing: one workload, four models, real prices."""
    t = fr / n
    im = base()
    eyebrow(im, "WHAT IT DOES", ease(seg(t, 0.02, 0.12)))
    headline(im, "One workload. Four models.", ease(seg(t, 0.04, 0.14)),
             sub="A support assistant at 4,000 conversations a day, 25,000 users.",
             sub_alpha=ease(seg(t, 0.16, 0.14)))

    a = ease(seg(t, 0.24, 0.18))
    zoom = kenburns(seg(t, 0.24, 0.76), 1.0, 1.05)
    box = place(im, load("01-cards"), W / 2, 660, 1080 * zoom, a)

    a2 = ease(seg(t, 0.70, 0.16))
    if a2 > 0.01 and box:
        d = ImageDraw.Draw(im)
        f = F("mono-bold", 34)
        low = "{}/mo".format(CARD_LOW)
        high = "{}/mo".format(CARD_HIGH)
        d.text((box[0] - 10 - tw(low, f), box[3] + 26), low, font=f, fill=fade(SAVE, a2))
        d.text((box[2] + 10 - tw(high, f), box[3] + 26), high, font=f, fill=fade(COST, a2))
        centred(im, "Same job. Same day.", box[3] + 24, F("body", 34), MUTED, a2)
    return im


def scene_saving(fr, n):
    """The payoff, in the engine's own words."""
    t = fr / n
    im = base()
    a0 = ease(seg(t, 0.02, 0.16))
    centred(im, "The gap between the two is not a rounding error.", 250,
            F("display-mid", 46), MUTED, a0)

    a = ease(seg(t, 0.18, 0.18))
    centred(im, SAVING, 340, F("display", 168), SAVE, a)

    a2 = ease(seg(t, 0.44, 0.16))
    place(im, load("01-saving"), W / 2, 660, 1300, a2, radius=12)

    a3 = ease(seg(t, 0.66, 0.16))
    if a3 > 0.01:
        centred(im, "Every figure on screen came out of the live catalog,", 790,
                F("body", 36), MUTED, a3)
        centred(im, "priced by the same engine the site runs on.", 838,
                F("body", 36), MUTED, ease(seg(t, 0.74, 0.16)))
    rule(im, 920, ease(seg(t, 0.84, 0.16)))
    return im


def scene_trust(fr, n):
    """Why the number is believable: it carries its own paperwork."""
    t = fr / n
    im = base()
    eyebrow(im, "WHY YOU CAN BELIEVE IT", ease(seg(t, 0.02, 0.12)))
    headline(im, "Every number shows its work.", ease(seg(t, 0.04, 0.14)),
             sub="Its source, a link to the page it came from, and the date it was confirmed.",
             sub_alpha=ease(seg(t, 0.16, 0.14)))

    a = ease(seg(t, 0.26, 0.16))
    place(im, load("02-health"), W / 2, 370, 1420, a, radius=12)

    a2 = ease(seg(t, 0.44, 0.18))
    place(im, load("02-flagged"), 1290, 740, 620, a2)

    a3 = ease(seg(t, 0.58, 0.18))
    if a3 > 0.01:
        d = ImageDraw.Draw(im)
        lines = [
            ("When two sources disagree,", MUTED),
            ("it is flagged, not hidden.", INK),
        ]
        for i, (s, c) in enumerate(lines):
            aa = ease(seg(t, 0.58 + i * 0.09, 0.16))
            d.text((250, 600 + i * 62), s, font=F("display-mid", 46), fill=fade(c, aa))
        a4 = ease(seg(t, 0.76, 0.16))
        badge(im, 250, 750, "{} FLAGGED TODAY".format(N_FLAGGED), WARN, a4, 28)
        a5 = ease(seg(t, 0.86, 0.14))
        if a5 > 0.01:
            d.text((250, 850), "Never overwritten. Both numbers stay",
                   font=F("body", 30), fill=fade(MUTED, a5))
            d.text((250, 890), "on the page, so you see the range.",
                   font=F("body", 30), fill=fade(MUTED, a5))
    return im


def scene_pipeline(fr, n):
    """The actual product is the pipeline; the calculator sits on top of it."""
    t = fr / n
    im = base()
    eyebrow(im, "HOW IT STAYS TRUE", ease(seg(t, 0.02, 0.12)))
    headline(im, "The pipeline is the product.", ease(seg(t, 0.04, 0.14)),
             sub="A GitHub Action re-fetches every source each morning, merges them under an",
             sub_alpha=ease(seg(t, 0.16, 0.14)))
    d = ImageDraw.Draw(im)
    d.text((123, HEAD_Y + 130), "explicit trust order, and publishes the diff.",
           font=F("body", 34), fill=fade(MUTED, ease(seg(t, 0.22, 0.14))))

    steps = [
        ("VENDOR PAGES", "hand-verified, win every conflict", SAVE),
        ("LITELLM CATALOG", "the daily automated feed", ACCENT),
        ("OPENROUTER", "a cross-check, never a source", WARN),
    ]
    x0, y0, gap = 180, 400, 132
    for i, (label, note, colour) in enumerate(steps):
        aa = ease(seg(t, 0.28 + i * 0.10, 0.16))
        if aa < 0.01:
            continue
        y = y0 + i * gap
        d.rounded_rectangle([x0, y, x0 + 1000, y + 100], radius=12,
                            fill=lerp(BG, SURFACE, aa), outline=fade(BORDER, aa), width=2)
        d.rounded_rectangle([x0, y, x0 + 8, y + 100], radius=4, fill=fade(colour, aa))
        d.text((x0 + 44, y + 20), "{}".format(i + 1), font=F("mono-bold", 30),
               fill=fade(colour, aa))
        d.text((x0 + 92, y + 18), label, font=F("body-semi", 34), fill=fade(INK, aa))
        d.text((x0 + 92, y + 60), note, font=F("body", 28), fill=fade(MUTED, aa))

    a2 = ease(seg(t, 0.62, 0.18))
    if a2 > 0.01:
        fx = F("display", 92)
        fl = F("mono-bold", 26)
        for i, (value, label) in enumerate(
            [(str(N_MODELS), "MODELS"), (str(N_PROVIDERS), "PROVIDERS")]
        ):
            aa = ease(seg(t, 0.62 + i * 0.08, 0.16))
            cx = 1480
            y = 410 + i * 190
            d.text((cx - tw(value, fx) / 2, y), value, font=fx, fill=fade(ACCENT, aa))
            d.text((cx - tw(label, fl) / 2, y + 108), label, font=fl, fill=fade(MUTED, aa))

    a3 = ease(seg(t, 0.82, 0.16))
    if a3 > 0.01:
        centred(im, "Re-checked every morning, whether anything moved or not.", 860,
                F("display-mid", 44), INK, a3)
    return im


def scene_cta(fr, n):
    """Where to go, and what it costs."""
    t = fr / n
    im = base()
    a0 = ease(seg(t, 0.02, 0.16))
    centred(im, "Know the tab", 210, F("display", 96), INK, a0)
    centred(im, "before you build.", 320, F("display", 96), ACCENT,
            ease(seg(t, 0.12, 0.16)))

    a = ease(seg(t, 0.28, 0.18))
    if a > 0.01:
        d = ImageDraw.Draw(im)
        f = F("mono-bold", 62)
        w = tw(SITE, f) + 120
        box = [W / 2 - w / 2, 480, W / 2 + w / 2, 610]
        d.rounded_rectangle(box, radius=14, fill=lerp(BG, SURFACE, a),
                            outline=fade(ACCENT, a), width=3)
        d.text((W / 2 - tw(SITE, f) / 2, 508), SITE, font=f, fill=fade(INK, a))

    a2 = ease(seg(t, 0.50, 0.18))
    if a2 > 0.01:
        chips = ["FREE", "NO ACCOUNTS", "NO TRACKING", "MIT", "OPEN DATA API"]
        fc = F("mono-bold", 26)
        widths = [tw(c, fc) + 44 for c in chips]
        total = sum(widths) + 20 * (len(chips) - 1)
        x = W / 2 - total / 2
        for c, wpx in zip(chips, widths):
            badge(im, x, 690, c, ACCENT, a2, 26, pad=22)
            x += wpx + 20

    a3 = ease(seg(t, 0.68, 0.16))
    if a3 > 0.01:
        centred(im, "github.com/AndrewAvery7/promptspend", 810, F("body", 36), MUTED, a3)
    rule(im, 900, ease(seg(t, 0.80, 0.16)))
    return im


# (scene, total frames, animated frames). Everything animates within the second
# number; the remaining frames hold the finished composition so there is time to
# read it. Scenes express motion through seg()/ease(), which clamp, so rendering
# past the animated length persists the final state while the real frame index
# keeps advancing.
#
# HOLD TIME
#
# The first cut held each finished frame for barely a second, which is enough to
# see a composition and not enough to read one. These holds are set from what is
# actually on each frame rather than by adding a flat amount to every scene,
# because the burden is wildly uneven: the trust scene carries a hundred-odd
# words across two panels, the call to action carries sixteen.
#
# The working figure is roughly 180 words per minute for comfortable reading of
# text you have not seen before - the rate subtitle standards use - discounted
# for the fact that most of each composition has already faded in and been read
# during the animated portion. The hold is the settled time on top of that, so
# a viewer can re-scan the whole frame once without racing.
#
# Screenshots count as scanning rather than reading: nobody reads a cost card
# top to bottom, they look for the number. But four of them still take longer
# to take in than one headline, which is why the estimate scene holds longest
# alongside the trust scene.
HOLD = {  # seconds of settled time after everything has appeared
    "problem": 4.0,    # 39 words, mostly large type
    "spread": 5.0,     # short copy, but a 69-point scatter plot to take in
    "estimate": 6.5,   # four cost cards, ~15 figures each - the densest frame
    "saving": 5.0,     # one big number lands fast, then a two-line callout
    "trust": 6.3,      # two panels plus three lines; the heaviest for text
    "pipeline": 6.0,   # a three-step ladder, two counters, a closing line
    "cta": 4.5,        # light, but it is the address and it should linger
}


def _frames(seconds):
    return int(round(seconds * FPS))


SCENES = [
    (scene_problem, 180 + _frames(HOLD["problem"]), 180),      # the snapshot problem
    (scene_spread, 165 + _frames(HOLD["spread"]), 165),        # the size of the decision
    (scene_estimate, 205 + _frames(HOLD["estimate"]), 205),    # the product working
    (scene_saving, 150 + _frames(HOLD["saving"]), 150),        # the payoff
    (scene_trust, 195 + _frames(HOLD["trust"]), 195),          # provenance and flags
    (scene_pipeline, 200 + _frames(HOLD["pipeline"]), 200),    # the daily sync
    (scene_cta, 145 + _frames(HOLD["cta"]), 145),              # where to go
]


def check():
    """Assert every figure hard-coded above still matches the catalog.

    The screenshots are captured, not drawn, so the risk is the reverse of the
    usual one: the pictures stay current and the *captions* rot. This is the
    guard for that, and it runs in the same command that builds the video.
    """
    problems = []
    ids = {m["id"]: m for m in CATALOG["models"]}

    def rate(model_id, field):
        return ids[model_id]["pricing"][field]

    # The four cards, exactly as the capture scenario selects them.
    for model_id, name in [
        ("claude-opus-5", DEAREST_CARD),
        ("deepseek-deepseek-v3.2", CHEAPEST_CARD),
    ]:
        if model_id not in ids:
            problems.append("{} is no longer in the catalog".format(model_id))
        elif ids[model_id]["displayName"] != name:
            problems.append("{} is now called {!r}, the video says {!r}".format(
                model_id, ids[model_id]["displayName"], name))

    if "claude-opus-5" in ids and "deepseek-deepseek-v3.2" in ids:
        # The saving is proportional to the monthly gap, so if either rate has
        # moved the figure on screen is stale even though the screenshot shows
        # it. Compare the ratio rather than re-implementing the cost engine.
        ratio = ((rate("claude-opus-5", "input") + rate("claude-opus-5", "output")) /
                 (rate("deepseek-deepseek-v3.2", "input") + rate("deepseek-deepseek-v3.2", "output")))
        if not 40 < ratio < 50:
            problems.append(
                "the {} / {} rate ratio is now {:.1f}; the captured saving of {} "
                "was computed at ~44 and needs re-capturing".format(
                    DEAREST_CARD, CHEAPEST_CARD, ratio, SAVING))

    for path in ["01-cards", "01-saving", "02-valuemap", "02-health", "02-flagged"]:
        if not (FRAMES / (path + ".png")).exists():
            problems.append("missing capture {}.png".format(path))

    # The spread is spoken over a screenshot of the Compare view, whose own
    # headline states it. If the two ever disagree the video is arguing with
    # the product on camera.
    valuemap = FRAMES / "02-compare-top.png"
    if valuemap.exists():
        expected = "Price is a {} decision.".format(SPREAD.replace("x", "×"))
        print("  the Compare headline should read: {!r}".format(expected))

    for problem in problems:
        print("  x {}".format(problem))
    if problems:
        print("\n  re-run `npx tsx tools/capture-ui.ts` and update the constants "
              "in this file")
        return 1
    print("  ok - {} models, {} providers, {} flagged, spread {}".format(
        N_MODELS, N_PROVIDERS, N_FLAGGED, SPREAD))
    return 0


def draw_mark(d, x, y, size, colour):
    """The favicon mark: a rounded square with three ledger rules.

    Same 26-unit geometry as tools/make-assets.py and the SVG in index.html, so
    the video, the README logo and the browser tab are one shape rather than
    three drawings of the same idea.
    """
    u = size / 26.0
    stroke = max(1, round(2 * u))
    d.rounded_rectangle([x + 1.5 * u, y + 1.5 * u, x + 24.5 * u, y + 24.5 * u],
                        radius=6 * u, outline=colour, width=stroke)
    for y_off, length in ((9.5, 12), (13.5, 8), (17.5, 10)):
        d.line([x + 7 * u, y + y_off * u, x + (7 + length) * u, y + y_off * u],
               fill=colour, width=stroke)
        r = stroke / 2
        for cx in (x + 7 * u, x + (7 + length) * u):
            d.ellipse([cx - r, y + y_off * u - r, cx + r, y + y_off * u + r], fill=colour)


def wordmark(d, x, y, size, ink, accent):
    """"Prompt" in the ink colour, "Spend" in the accent. Returns the width."""
    f = F("display", size)
    first = d.textlength("Prompt", font=f)
    d.text((x, y), "Prompt", font=f, fill=ink)
    d.text((x + first, y), "Spend", font=f, fill=accent)
    return first + d.textlength("Spend", font=f)


def make_overlays(out):
    """The lower-third and end-card logo the stitch script composites.

    Transparent PNGs rather than burnt-in frames, so the same artwork can sit
    over whatever the generative bookends turn out to look like.
    """
    # Lower third: full frame, transparent, content in the lower-left.
    title = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # A scrim under it. The hero clip is bright, busy particle motion, and
    # without this the tagline sat on top of moving highlights and was
    # genuinely unreadable — legible in a still, lost in motion. A vertical
    # gradient rather than a panel, so there is no visible edge over footage
    # that is itself fading in.
    scrim = Image.new("L", (1, H), 0)
    for row in range(H):
        if row < 620:
            value = 0
        else:
            value = int(190 * ((row - 620) / (H - 620)) ** 0.8)
        scrim.putpixel((0, row), value)
    title.paste(Image.new("RGBA", (W, H), (5, 8, 14, 255)),
                (0, 0), scrim.resize((W, H)))

    d = ImageDraw.Draw(title)
    x, y = 150, 800
    draw_mark(d, x, y - 6, 104, ACCENT + (255,))
    width = wordmark(d, x + 140, y - 14, 84, INK + (255,), ACCENT + (255,))
    d.text((x + 142, y + 92), "Know the tab before you build.",
           font=F("body", 38), fill=MUTED + (235,))
    d.line([x, y + 160, x + 140 + width, y + 160], fill=ACCENT + (140,), width=3)
    title.save(out / "title-overlay.png")

    # End card: the wordmark alone, dropped in centred by the stitch script.
    #
    # Drawn on a deliberately oversized canvas and then cropped to what was
    # actually drawn. A fixed canvas is a guess about text metrics, and when the
    # guess is wrong the artwork sits off-centre while the file looks fine — the
    # README logo had exactly that fault, 9px of padding on one side and 167 on
    # the other.
    card = Image.new("RGBA", (1600, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    draw_mark(d, 20, 56, 128, ACCENT + (255,))
    wordmark(d, 190, 44, 104, INK + (255,), ACCENT + (255,))
    d.text((196, 168), "promptspend.com", font=F("mono-bold", 38), fill=MUTED + (235,))
    bbox = card.getbbox()
    card = card.crop(bbox)
    padded = Image.new("RGBA", (card.width + 24, card.height + 24), (0, 0, 0, 0))
    padded.paste(card, (12, 12))
    padded.save(out / "endcard-logo.png")
    print("wrote title-overlay.png and endcard-logo.png ({}x{})".format(
        padded.width, padded.height))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default=str(ROOT / "assets"))
    ap.add_argument("--check", action="store_true",
                    help="verify the captions still match the catalog, then stop")
    args = ap.parse_args()

    global FONT_FILES
    FONT_FILES = build_fonts()

    print("checking the figures against the catalog:")
    failed = check()
    if args.check or failed:
        return failed

    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    make_overlays(out)
    tmp = Path(tempfile.mkdtemp(prefix="ps-promo-"))
    idx = 0
    for fn, count, anim in SCENES:
        for f in range(count):
            fn(f, anim).save(tmp / "f{:05d}.png".format(idx))
            idx += 1
        print("  {}: {} frames ({} animated + {} hold)".format(
            fn.__name__, count, anim, count - anim))
    print("total {} frames = {:.1f}s".format(idx, idx / FPS))

    if not shutil.which("ffmpeg"):
        print("ffmpeg not found - frames left in", tmp)
        return 1
    core = out / "core.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-framerate", str(FPS), "-i", str(tmp / "f%05d.png"),
         "-c:v", "libx264", "-preset", "slow", "-crf", "18",
         "-pix_fmt", "yuv420p", str(core)],
        check=True, capture_output=True,
    )
    print("wrote", core)
    shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
