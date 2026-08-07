"""Generate the logo and social card.

Everything is drawn from primitives and system fonts, so the assets are
reproducible: re-running this regenerates them rather than depending on a design
file nobody has. The mark is the same rounded square and three ledger rules as
the site favicon, and the colours are read from the same values as
`src/styles/tokens.css` -- if the brand moves, both move together.

    python tools/make-assets.py

Outputs assets/logo.png, assets/logo-dark.png and assets/social-card.png, plus
the installable-app and notification icons in public/.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

SCALE = 4  # render large, downsample once, for clean antialiasing
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")
PUBLIC = os.path.join(ROOT, "public")

FONT_DIRS = [
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts"),
    r"C:\Windows\Fonts",
    "/usr/share/fonts/truetype/dejavu",
    "/Library/Fonts",
    "/System/Library/Fonts",
]
# Space Grotesk is the site's display face but is rarely installed system-wide;
# Poppins and Inter are the closest geometric sans fallbacks.
FONT_CANDIDATES = {
    "bold": ["Poppins-Bold.ttf", "Inter-Variable.ttf", "segoeuib.ttf",
             "arialbd.ttf", "DejaVuSans-Bold.ttf"],
    "medium": ["Poppins-Medium.ttf", "Inter-Variable.ttf", "segoeui.ttf",
               "arial.ttf", "DejaVuSans.ttf"],
    "mono": ["JetBrainsMono-Regular.ttf", "CascadiaMono.ttf", "consola.ttf",
             "Menlo.ttc", "DejaVuSansMono.ttf"],
}

# Straight from src/styles/tokens.css.
LIGHT = {
    "accent": (0x24, 0x56, 0xE6),   # --accent  cobalt
    "ink": (0x15, 0x18, 0x1D),      # --ink
    "muted": (0x5F, 0x6B, 0x78),    # --muted
    "bg": (0xEB, 0xEF, 0xF5),       # --bg      cool paper
    "surface": (0xFF, 0xFF, 0xFF),  # --surface
    "surface2": (0xFA, 0xFB, 0xFD), # --surface-2
    "border": (0xDC, 0xE2, 0xEB),   # --border
    "save": (0x0E, 0x7B, 0x43),     # --save    green means you save
    "cost": (0xC6, 0x28, 0x28),     # --cost    red means this costs more
}
DARK = {
    "accent": (0x7C, 0x9D, 0xFF),
    "ink": (0xE9, 0xEC, 0xF2),
    "muted": (0x93, 0xA0, 0xB4),
    "bg": (0x0B, 0x0E, 0x14),
    "surface": (0x12, 0x17, 0x22),
    "surface2": (0x1A, 0x21, 0x30),
    "border": (0x27, 0x30, 0x3F),
    "save": (0x3C, 0xCB, 0x7F),
    "cost": (0xF9, 0x70, 0x66),
}


def find_font(kind, size):
    for name in FONT_CANDIDATES[kind]:
        for directory in FONT_DIRS:
            if not directory:
                continue
            path = os.path.join(directory, name)
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except OSError:
                    continue
    print(f"! no {kind} font found, falling back to PIL default", file=sys.stderr)
    return ImageFont.load_default()


def draw_mark(draw, x, y, size, colour):
    """The favicon mark: a rounded square with three ledger rules inside it.

    Drawn from the same geometry as the SVG in index.html (a 26-unit viewBox),
    so the README logo and the browser tab are the same shape.
    """
    u = size / 26.0
    stroke = max(1, round(2 * u))

    draw.rounded_rectangle(
        [x + 1.5 * u, y + 1.5 * u, x + 24.5 * u, y + 24.5 * u],
        radius=6 * u,
        outline=colour,
        width=stroke,
    )
    for y_off, length in ((9.5, 12), (13.5, 8), (17.5, 10)):
        draw.line(
            [x + 7 * u, y + y_off * u, x + (7 + length) * u, y + y_off * u],
            fill=colour,
            width=stroke,
        )
        # Round caps, which `line` does not give us on its own.
        r = stroke / 2
        for cx in (x + 7 * u, x + (7 + length) * u):
            draw.ellipse([cx - r, y + y_off * u - r, cx + r, y + y_off * u + r], fill=colour)


def trim_to_content(img, pad):
    """Crop to the drawn artwork, then pad it back symmetrically.

    The canvas size was fixed while the artwork's width is not: `find_font`
    walks a candidate list, so the wordmark is a different width on a machine
    that has Poppins than on one falling back to Segoe UI or DejaVu. Here the
    logo ended up 406px of artwork on a 582px canvas - 9px of padding on the
    left and 167px on the right - so `<p align="center">` centred the canvas
    and left the logo visibly off to one side in the README.

    Cropping to what was actually drawn makes the file centre itself wherever
    it is placed, on any machine, instead of depending on a guess about metrics.
    """
    bbox = img.getbbox()
    if bbox is None:
        return img
    cropped = img.crop(bbox)
    out = Image.new("RGBA", (cropped.width + pad * 2, cropped.height + pad * 2), (0, 0, 0, 0))
    out.paste(cropped, (pad, pad))
    return out


def make_logo(theme, path):
    # Generous canvas: it is cropped to the artwork below, so this only has to
    # be large enough that nothing is clipped.
    w, h = 720 * SCALE, 140 * SCALE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    mark = 64 * SCALE
    mark_x, mark_y = 8 * SCALE, (h - mark) // 2
    draw_mark(d, mark_x, mark_y, mark, theme["accent"])

    font = find_font("bold", 46 * SCALE)
    text_x = mark_x + mark + 18 * SCALE
    # "Prompt" in ink, "Spend" in the accent -- exactly how the site header
    # renders the wordmark.
    prompt_w = d.textlength("Prompt", font=font)
    baseline = (h - 52 * SCALE) // 2
    d.text((text_x, baseline), "Prompt", font=font, fill=theme["ink"])
    d.text((text_x + prompt_w, baseline), "Spend", font=font, fill=theme["accent"])

    sub = find_font("medium", 17 * SCALE)
    d.text(
        (text_x + 3 * SCALE, baseline + 58 * SCALE),
        "know the tab before you build",
        font=sub,
        fill=theme["muted"],
    )

    # Emitted at 2x the size it is displayed at, so it stays sharp on a HiDPI
    # screen. The README sets the width to half of this; cropping to the artwork
    # made the file smaller than the width it used to be given, and serving a
    # 417px image at 540 would have traded one visible fault for another.
    trimmed = trim_to_content(img, 8 * SCALE)
    retina = (trimmed.width // (SCALE // 2), trimmed.height // (SCALE // 2))
    trimmed.resize(retina, Image.LANCZOS).save(path)
    print(f"wrote {path} ({retina[0]}x{retina[1]}, display at {retina[0] // 2}px)")


def make_social_card(path):
    """1280x640, the size GitHub and every social preview crops to."""
    theme = LIGHT
    w, h = 1280 * SCALE, 640 * SCALE
    img = Image.new("RGB", (w, h), theme["bg"])
    d = ImageDraw.Draw(img)

    pad = 64 * SCALE
    d.rounded_rectangle(
        [pad, pad, w - pad, h - pad],
        radius=28 * SCALE,
        fill=theme["surface"],
        outline=theme["border"],
        width=2 * SCALE,
    )

    inner = pad + 52 * SCALE
    mark = 62 * SCALE
    draw_mark(d, inner, inner - 6 * SCALE, mark, theme["accent"])

    wordmark = find_font("bold", 44 * SCALE)
    wx = inner + mark + 18 * SCALE
    prompt_w = d.textlength("Prompt", font=wordmark)
    d.text((wx, inner + 2 * SCALE), "Prompt", font=wordmark, fill=theme["ink"])
    d.text((wx + prompt_w, inner + 2 * SCALE), "Spend", font=wordmark, fill=theme["accent"])

    headline = find_font("bold", 62 * SCALE)
    d.text((inner, inner + 108 * SCALE), "Know the tab", font=headline, fill=theme["ink"])
    before_w = d.textlength("before ", font=headline)
    d.text((inner, inner + 180 * SCALE), "before", font=headline, fill=theme["accent"])
    d.text((inner + before_w, inner + 180 * SCALE), "you build.", font=headline, fill=theme["ink"])

    sub = find_font("medium", 25 * SCALE)
    d.text(
        (inner, inner + 272 * SCALE),
        "Estimate and compare LLM API costs, from a catalog",
        font=sub,
        fill=theme["muted"],
    )
    d.text(
        (inner, inner + 308 * SCALE),
        "that re-checks itself every morning.",
        font=sub,
        fill=theme["muted"],
    )

    # Three cost chips, cheapest first -- the shape of the product's own answer,
    # and a reminder that the spread is the whole point. The figures are the
    # cheapest, middle and dearest of the site's own default estimate.
    #
    # They are literals because this script draws from primitives and stays
    # dependency-free, which means nothing here notices when the catalog moves.
    # `npm run check:social-card` recomputes them through the real engine and
    # fails when they drift -- it caught exactly that on 2026-08-07, two days
    # after the mid and frontier tiers stopped being true. Change these only
    # together with the `og:image:alt` text in index.html, which repeats them.
    mono = find_font("mono", 27 * SCALE)
    label = find_font("medium", 15 * SCALE)
    chips = [
        ("BUDGET", "$723/mo", theme["save"]),
        ("MID", "$2,417/mo", theme["muted"]),
        ("FRONTIER", "$11,081/mo", theme["cost"]),
    ]
    chip_w, chip_h = 196 * SCALE, 96 * SCALE
    cx = w - pad - 52 * SCALE - chip_w
    cy = inner + 4 * SCALE
    for name, amount, colour in chips:
        d.rounded_rectangle(
            [cx, cy, cx + chip_w, cy + chip_h],
            radius=14 * SCALE,
            fill=theme["surface2"],
            outline=theme["border"],
            width=2 * SCALE,
        )
        d.text((cx + 18 * SCALE, cy + 16 * SCALE), name, font=label, fill=theme["muted"])
        d.text((cx + 18 * SCALE, cy + 42 * SCALE), amount, font=mono, fill=colour)
        cy += chip_h + 18 * SCALE

    foot = find_font("medium", 20 * SCALE)
    d.text(
        (inner, h - pad - 62 * SCALE),
        "Open source  ·  MIT  ·  no accounts, no tracking",
        font=foot,
        fill=theme["muted"],
    )

    img.resize((1280, 640), Image.LANCZOS).save(path)
    print(f"wrote {path}")


def make_app_icon(size, path):
    """A square app icon: the mark on the brand colour.

    Sized with the mark at 60% of the canvas so it survives the circular crop
    Android applies to a maskable icon -- anything closer to the edge loses its
    corners on the devices that mask hardest.
    """
    px = size * SCALE
    img = Image.new("RGBA", (px, px), LIGHT["accent"] + (255,))
    d = ImageDraw.Draw(img)

    mark = int(px * 0.60)
    offset = (px - mark) // 2
    draw_mark(d, offset, offset, mark, (0xFF, 0xFF, 0xFF))

    img.resize((size, size), Image.LANCZOS).save(path)
    print(f"wrote {path}")


def make_badge(size, path):
    """The small monochrome glyph Android shows in the status bar.

    It is used as a mask: every non-transparent pixel is repainted a flat
    colour by the system, so the artwork has to be a silhouette. Drawing it in
    any brand colour would look correct here and arrive as a white blob.
    """
    px = size * SCALE
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    mark = int(px * 0.86)
    offset = (px - mark) // 2
    draw_mark(d, offset, offset, mark, (0xFF, 0xFF, 0xFF))

    img.resize((size, size), Image.LANCZOS).save(path)
    print(f"wrote {path}")


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PUBLIC, exist_ok=True)
    make_logo(LIGHT, os.path.join(OUT, "logo.png"))
    make_logo(DARK, os.path.join(OUT, "logo-dark.png"))
    make_social_card(os.path.join(OUT, "social-card.png"))
    # A second copy under public/, because `assets/` is repository documentation
    # and is never served. og:image needs a URL that actually resolves — a card
    # that only exists in the repo is a card no social preview will ever show.
    make_social_card(os.path.join(PUBLIC, "social-card.png"))

    # Installing to the home screen is what unlocks web push on iOS, so these
    # are part of the alerts feature rather than decoration.
    make_app_icon(192, os.path.join(PUBLIC, "icon-192.png"))
    make_app_icon(512, os.path.join(PUBLIC, "icon-512.png"))
    make_app_icon(180, os.path.join(PUBLIC, "apple-touch-icon.png"))
    make_badge(72, os.path.join(PUBLIC, "badge-72.png"))


if __name__ == "__main__":
    main()
