"""Visual-target enhancement pass over a real Riftbomb gameplay frame.

Goal: keep the exact composition/gameplay readability of the source frame
and push art direction - hextech rift mood, cool atmospheric depth, warm
amber on interactive crates, emissive bloom on crystals/abilities, and a
protected HUD. Output is a single polished still (visual target for the
team), not a promotional illustration.
"""

import numpy as np
from PIL import Image, ImageFilter

SRC = "learning-records/after-02-play.png"
DST = "learning-records/after-02-play-enhanced.png"

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)

img = Image.open(SRC).convert("RGB")
W, H = img.size
base = np.asarray(img).astype(np.float32) / 255.0
a = base.copy()

# ---------------------------------------------------------------- masks (from source)
luma = base @ LUMA
r, g, b = base[..., 0], base[..., 1], base[..., 2]
mx = base.max(axis=2)
mn = base.min(axis=2)
diff = mx - mn + 1e-6
sat = diff / (mx + 1e-6)

hue = np.zeros_like(mx)
chrom = diff > 1e-5
idx = (mx == r) & chrom
hue[idx] = ((g - b)[idx] / diff[idx]) % 6
idx = (mx == g) & chrom
hue[idx] = (b - r)[idx] / diff[idx] + 2
idx = (mx == b) & chrom
hue[idx] = (r - g)[idx] / diff[idx] + 4
hue *= 60.0

# gameplay element masks
cyan_emissive = (((hue > 150) & (hue < 210)) & (sat > 0.30) & (mx > 0.35)).astype(np.float32)
hot_emissive = ((((hue > 300) | (hue < 18)) & (sat > 0.38) & (mx > 0.42))).astype(np.float32)
warm_crate = (((hue > 12) & (hue < 48)) & (sat > 0.22) & (mx > 0.20)).astype(np.float32)
flat_floor = ((sat < 0.22) & (mx < 0.42)).astype(np.float32)

# soften masks so graded zones blend instead of banding
def soften(mask, radius):
    im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(im).astype(np.float32) / 255.0

cyan_emissive = soften(cyan_emissive, 3)
hot_emissive = soften(hot_emissive, 4)
warm_crate = soften(warm_crate, 2)
flat_floor = soften(flat_floor, 5)

# HUD protection: top banner/title, counters, side metrics, bottom bar
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
hud = np.zeros((H, W), np.float32)
hud[yy < 0.085 * H] = 1.0                                   # top strip (title + round banner)
hud[(yy < 0.26 * H) & (xx < 0.16 * W)] = 1.0                # left crate counter
hud[(yy < 0.20 * H) & (xx > 0.87 * W)] = 1.0                # right metrics
hud[yy > 0.875 * H] = 1.0                                   # bottom HUD bar
hud = soften(hud, 12)
shelter = 1.0 - 0.75 * hud                                  # effects keep 25% strength on HUD

# ---------------------------------------------------------------- 1. split toning
shadow_w = (np.clip(1.0 - luma * 2.2, 0, 1) ** 1.5)[..., None]
high_w = (np.clip(luma * 1.6 - 0.35, 0, 1) ** 2)[..., None]
teal = np.array([0.90, 1.03, 1.09], np.float32)
amber = np.array([1.07, 1.01, 0.93], np.float32)
a = a * (1.0 + (teal - 1.0) * shadow_w) * (1.0 + (amber - 1.0) * high_w)

# ---------------------------------------------------------------- 2. contrast + black lift
a = np.clip((a - 0.45) * 1.11 + 0.45, 0, 1)
a = a * 0.975 + 0.010                                       # gentle atmospheric floor on blacks

# ---------------------------------------------------------------- 3. saturation shaping
lum2 = (a @ LUMA)[..., None]
boost = 1.14 + 0.10 * warm_crate[..., None] - 0.10 * flat_floor[..., None]
a = np.clip(lum2 + (a - lum2) * boost, 0, 1)

# ---------------------------------------------------------------- 4. material separation
# interactive crates: warmer, richer finish
crate_tint = np.array([1.06, 1.00, 0.94], np.float32)
a = a * (1.0 + (crate_tint - 1.0) * warm_crate[..., None])
# inert floor/border: cooler and recessed so gameplay elements lead
floor_tint = np.array([0.92, 1.00, 1.05], np.float32)
a = a * (1.0 + (floor_tint - 1.0) * (flat_floor[..., None] * 0.8))
a = a * (1.0 - 0.06 * flat_floor[..., None])
a = np.clip(a, 0, 1)

# ---------------------------------------------------------------- 5. depth haze (far = top)
t = np.clip(1.0 - yy / (0.92 * H), 0, 1) ** 1.7             # stronger toward the far edge
haze_col = np.array([0.10, 0.17, 0.21], np.float32)
haze_amt = (0.24 * t * shelter)[..., None]
a = a * (1.0 - haze_amt) + haze_col * haze_amt

# ---------------------------------------------------------------- 6. key light + vignette
cx, cy = 0.50 * W, 0.44 * H
d = np.sqrt(((xx - cx) / (0.62 * W)) ** 2 + ((yy - cy) / (0.62 * H)) ** 2)
key = np.clip(1.0 - d, 0, 1) ** 1.6
light = 1.0 + 0.11 * key * shelter
vig = 1.0 - 0.30 * (np.clip(d - 0.52, 0, 1) ** 1.8) * shelter
a = np.clip(a * (light * vig)[..., None], 0, 1)

# ---------------------------------------------------------------- 7. emissive bloom
lum3 = a @ LUMA
bright = np.clip(lum3 - 0.55, 0, 1) * 1.4
emis = np.clip(cyan_emissive * 0.9 + hot_emissive * 1.0, 0, 1)
bloom_w = np.clip(bright + emis * np.clip(lum3 * 1.6, 0.25, 1.0), 0, 1)
bloom_src = a * bloom_w[..., None]

def blur_layer(arr, radius):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255.0

near = blur_layer(bloom_src, 9) * 0.42
far = blur_layer(bloom_src, 30) * 0.26
bloom = np.clip(near + far, 0, 1) * shelter[..., None]
a = 1.0 - (1.0 - a) * (1.0 - bloom)                         # screen blend

# cyan crystals get a subtle dedicated glow so pickups read at a glance
crystal_glow = blur_layer(base * cyan_emissive[..., None], 14) * 0.55
a = 1.0 - (1.0 - a) * (1.0 - np.clip(crystal_glow, 0, 1) * shelter[..., None])

# ---------------------------------------------------------------- 7b. hero readability
# soft local lift under each champion so the eye finds player/enemy first;
# positions are this frame's champion tiles (Katarina P1, Ziggs CPU)
def hero_pool(hx, hy, radius, strength, tint):
    dist = np.sqrt((xx - hx) ** 2 + (yy - hy) ** 2) / radius
    pool = np.clip(1.0 - dist, 0, 1) ** 2.0 * strength
    return pool[..., None] * tint

kat = hero_pool(0.160 * W, 0.74 * H, 0.115 * W, 0.16, np.array([0.55, 0.65, 1.00], np.float32))
zig = hero_pool(0.735 * W, 0.305 * H, 0.105 * W, 0.15, np.array([1.00, 0.45, 0.40], np.float32))
a = np.clip(a + kat + zig, 0, 1)

# ---------------------------------------------------------------- 8. final grade + sharpen
a = np.clip(a, 0, 1)
out = Image.fromarray((a * 255).astype(np.uint8))
out = out.filter(ImageFilter.UnsharpMask(radius=2, percent=38, threshold=2))
out.save(DST)
print("saved", DST, out.size)
