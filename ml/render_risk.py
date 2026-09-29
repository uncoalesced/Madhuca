"""Render a RiskGrid as a smooth image clipped to the region's own states.

    python ml/render_risk.py frontend/public/risk/telangana.json

The model scores 0.1 degree cells (about 11 km), and drawing those cells as squares
made a box that ignored state lines and spilled over the coast and into Karnataka,
Tamil Nadu and Odisha. This turns the grid into a PNG next to it (<region>.png):

- probabilities are interpolated bilinearly between cell centres, so there are no
  square edges inside the region;
- pixels outside the region's states (frontend/public/boundaries/states.json) are
  transparent, so the layer stops at state borders and at the coast;
- rows are spaced evenly in Web Mercator, because a MapLibre image source stretches
  linearly in that projection; rows even in latitude would drift north-south.

The colours are the same ramp the map used for the cells. Nothing about the model or
its probabilities changes; this is display only. numpy and the standard library only.
"""

import json
import math
import os
import struct
import sys
import zlib

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
STATES = os.path.join(HERE, "..", "frontend", "public", "boundaries", "states.json")
DEG_PER_PX = 0.01  # about 1 km: finer than any state border simplification

# Which states each region's layer is clipped to.
REGION_STATES = {
    "telangana": ["Telangana", "Andhra Pradesh"],
}

# (p, RGB) stops: the ramp MapView used for the cells.
RAMP = [(0.0, (0xF1, 0xF3, 0xF0)), (0.02, (0xF1, 0x91, 0x43)), (0.1, (0xEF, 0x2D, 0x56))]


def merc(lat):
    return np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))


def inv_merc(y):
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def state_rings(names):
    with open(STATES, encoding="utf-8") as f:
        features = json.load(f)["features"]
    found = {ft["properties"]["name"]: ft for ft in features}
    missing = [n for n in names if n not in found]
    if missing:
        sys.exit(f"states not in {STATES}: {missing}")
    return [np.array(ring, dtype=float) for n in names for poly in found[n]["geometry"]["coordinates"] for ring in poly]


def inside_mask(rings, lons, lats):
    """Even-odd scanline fill: for each row, toggle at every edge crossing to its left."""
    edges = np.concatenate([np.stack([r[:-1], r[1:]], axis=1) for r in rings])  # (E, 2, 2)
    x0, y0, x1, y1 = edges[:, 0, 0], edges[:, 0, 1], edges[:, 1, 0], edges[:, 1, 1]
    mask = np.zeros((len(lats), len(lons)), dtype=bool)
    for r, lat in enumerate(lats):
        crosses = (y0 > lat) != (y1 > lat)
        xs = np.sort(x0[crosses] + (lat - y0[crosses]) * (x1[crosses] - x0[crosses]) / (y1[crosses] - y0[crosses]))
        # Number of crossings strictly left of each pixel; odd = inside.
        mask[r] = np.searchsorted(xs, lons) % 2 == 1
    return mask


def bilinear(grid, lons, lats):
    """p at each pixel from cell-centre values. Neighbours without data (sea, abroad)
    are left out and the rest reweighted, so the coast is cut by the state outline,
    not by the 11 km cells. NaN only where all four neighbours lack data."""
    w, s = grid["bbox"][0], grid["bbox"][1]
    d, cols, rows = grid["cellDeg"], grid["cols"], grid["rows"]
    raw = np.array(grid["risk"], dtype=float).reshape(rows, cols)  # row 0 = south
    p = np.where(raw > 0, (raw - 1) / 254, np.nan)
    fx = np.clip((lons - w) / d - 0.5, 0, cols - 1)
    fy = np.clip((lats - s) / d - 0.5, 0, rows - 1)
    c0 = np.minimum(np.floor(fx).astype(int), cols - 2)
    r0 = np.minimum(np.floor(fy).astype(int), rows - 2)
    tx = (fx - c0)[None, :]
    ty = (fy - r0)[:, None]
    R, C = r0[:, None], c0[None, :]
    total = np.zeros((len(lats), len(lons)))
    weight = np.zeros_like(total)
    for v, wt in (
        (p[R, C], (1 - tx) * (1 - ty)),
        (p[R, C + 1], tx * (1 - ty)),
        (p[R + 1, C], (1 - tx) * ty),
        (p[R + 1, C + 1], tx * ty),
    ):
        ok = ~np.isnan(v)
        total += np.where(ok, v, 0) * wt
        weight += np.where(ok, wt, 0)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(weight > 0, total / weight, np.nan)


def colour(p):
    ps = [s for s, _ in RAMP]
    return np.stack([np.interp(p, ps, [c[i] for _, c in RAMP]) for i in range(3)], axis=-1)


def write_png(path, rgba):
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[y].tobytes() for y in range(h))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def render(grid_path):
    with open(grid_path, encoding="utf-8") as f:
        grid = json.load(f)
    region = grid["region"]
    w, s, e, n = grid["bbox"]
    width = round((e - w) / DEG_PER_PX)
    height = round(width * (merc(n) - merc(s)) / math.radians(e - w))
    lons = w + (np.arange(width) + 0.5) * (e - w) / width
    ys = merc(n) - (np.arange(height) + 0.5) * (merc(n) - merc(s)) / height  # top row = north
    lats = inv_merc(ys)

    p = bilinear(grid, lons, lats)
    inside = inside_mask(state_rings(REGION_STATES[region]), lons, lats) & ~np.isnan(p)
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., :3] = np.rint(colour(np.nan_to_num(p))).astype(np.uint8)
    rgba[..., 3] = np.where(inside, 255, 0)

    out = os.path.splitext(grid_path)[0] + ".png"
    write_png(out, rgba)
    print(f"{region}: {width}x{height} px, {inside.mean():.1%} inside {REGION_STATES[region]}, wrote {out} ({os.path.getsize(out)} bytes)")
    return lons, lats, rgba


def alpha_at(lons, lats, rgba, lon, lat):
    return int(rgba[int(np.abs(lats - lat).argmin()), int(np.abs(lons - lon).argmin()), 3])


if __name__ == "__main__":
    lons, lats, rgba = render(sys.argv[1])
    # The point of the exercise: the layer stops at state lines and the coast.
    checks = [("Nalgonda (Telangana)", 79.27, 17.06, True), ("Nellore (AP)", 79.99, 14.44, True),
              ("Bengaluru (Karnataka)", 77.59, 12.97, False), ("Chennai (Tamil Nadu)", 80.27, 13.08, False),
              ("Bay of Bengal", 83.5, 15.5, False), ("Bidar (Karnataka)", 77.52, 17.91, False)]
    if "telangana" in sys.argv[1]:
        for name, lon, lat, want in checks:
            a = alpha_at(lons, lats, rgba, lon, lat)
            if (a > 0) != want:
                sys.exit(f"FAIL {name}: alpha {a}, expected {'drawn' if want else 'transparent'}")
            print(f"ok  {name:24} alpha {a}")
