"""Key Imagine explosion plates to RGBA WebP — high-res Bomberman corridor set."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

session = Path(
    r"C:\Users\user\.grok\sessions\C%3A%5CProjetos%5Criftbomb\019fb84a-a7b1-7ec0-a932-6ad833ea4ab0\images"
)
out_dir = Path("game/arena-appearance/textures/fx/explosion")
raw_dir = Path("game/arena-appearance/raw-imagine/explosion-frames")
out_dir.mkdir(parents=True, exist_ok=True)
raw_dir.mkdir(parents=True, exist_ok=True)

# High-res plates: core cross morph + multi-frame corridor arms.
# Prefer new HQ Imagine edits (19–22) when present; fall back to earlier set.
sequence = [
    ("22.jpg", "00-core-cross"),        # HQ plus-shaped core
    ("20.jpg", "01-arm-corridor"),      # HQ horizontal arm
    ("21.jpg", "02-arm-peak"),          # arm peak intensity
    ("18.jpg", "03-core-peak"),         # core peak (prior cross)
    ("19.jpg", "04-cross-late"),        # late burn cross
    ("15.jpg", "05-ignition"),          # brief flash (detail only)
    ("16.jpg", "06-cross-mid"),         # mid morph
    ("12.jpg", "07-smoke"),             # smoke fade
]

SIZE = 1024


def to_rgba_key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = mx - mn
            if mx < 18:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Kill flat gray checker / studio floor leftovers
            if sat < 14 and 28 <= mx <= 210:
                px[x, y] = (0, 0, 0, 0)
                continue
            orange = max(0, r - b)
            # Preserve bright cores; ramp alpha with luminance + warm bias
            alpha = min(255, int(mx * 1.12 + orange * 0.32))
            if mx < 36:
                alpha = int(alpha * 0.3)
            # Soften near-black fringes so plates don't show square edges
            if mx < 48 and sat < 40:
                alpha = int(alpha * 0.45)
            px[x, y] = (r, g, b, alpha)
    return im


for src_name, label in sequence:
    src = session / src_name
    if not src.exists():
        print("missing", src)
        continue
    im = Image.open(src)
    im.convert("RGB").save(raw_dir / f"{label}-native.jpg", quality=94)
    rgba = to_rgba_key(im)
    webp_path = out_dir / f"{label}.webp"
    rgba.save(webp_path, "WEBP", quality=92, method=6)
    print(label, webp_path.stat().st_size, f"{SIZE}px")

print("done")
