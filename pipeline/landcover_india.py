"""National land cover from ESA WorldCover, for the whole of India in one pass.

    pip install rasterio numpy
    python pipeline/landcover_india.py

Offline only (docs/MASTER.md section 4), like landcover.sh. Reads the WorldCover v200
COGs straight off the public S3 bucket, at a prebuilt overview level, so only a few
hundred KB per 3 degree tile is fetched. Writes two files:

  frontend/public/landcover/india.bin     class grid for the classifier: 0 other,
                                          1 cropland, 2 forest; 2 bits per cell at
                                          RES degrees. A lookup is one array read, so
                                          the Worker needs no polygon index at all.
  frontend/public/landcover/farmland.png  cropland only, for the map's farmland toggle:
                                          1-bit palette PNG, rows even in Web Mercator.

Both are clipped to India's states (frontend/public/boundaries/states.json). Only tree
cover (class 10) is forest; grassland and shrubland stay 'other', as in landcover.sh.
ESA WorldCover v200 (2021), CC-BY 4.0, attributed in the app footer and README.
"""

import concurrent.futures as cf
import json
import math
import os
import struct
import sys
import zlib

import numpy as np
import rasterio
from rasterio.enums import Resampling

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(HERE, "..", "frontend", "public")
STATES = os.path.join(PUBLIC, "boundaries", "states.json")

RES = 0.005  # about 550 m, the order of a VIIRS pixel; a 3 degree tile is 600 cells
WEST, SOUTH, EAST, NORTH = 68.0, 6.0, 98.0, 38.0  # all of India incl. Ladakh, A&N
TILE = 3
S3 = "/vsis3/esa-worldcover/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif"
CROPLAND, FOREST = 40, 10

MAGIC = b"MLC1"
DISPLAY_RES = 0.01  # farmland image: about 1 km, enough for a toggle overlay
FARMLAND_RGB = (0xC9, 0xB0, 0x3A)  # wheat, distinct from the basemap's forest green


def read_tile(lat, lon):
    """(lat, lon, classes) for one 3x3 degree tile, or None where WorldCover has no tile (sea)."""
    name = f"N{lat:02d}E{lon:03d}"
    n = int(round(TILE / RES))
    try:
        with rasterio.open(S3.format(name)) as src:
            codes = src.read(1, out_shape=(n, n), resampling=Resampling.mode)
    except rasterio.errors.RasterioIOError:
        return None
    classes = np.zeros(codes.shape, dtype=np.uint8)
    classes[codes == CROPLAND] = 1
    classes[codes == FOREST] = 2
    return lat, lon, classes


def india_mask(lons, lats):
    """Even-odd scanline fill of every state polygon, per row of `lats`."""
    with open(STATES, encoding="utf-8") as f:
        features = json.load(f)["features"]
    rings = [np.array(r, dtype=float) for ft in features for poly in ft["geometry"]["coordinates"] for r in poly]
    edges = np.concatenate([np.stack([r[:-1], r[1:]], axis=1) for r in rings])
    x0, y0, x1, y1 = edges[:, 0, 0], edges[:, 0, 1], edges[:, 1, 0], edges[:, 1, 1]
    mask = np.zeros((len(lats), len(lons)), dtype=bool)
    for r, lat in enumerate(lats):
        hit = (y0 > lat) != (y1 > lat)
        xs = np.sort(x0[hit] + (lat - y0[hit]) * (x1[hit] - x0[hit]) / (y1[hit] - y0[hit]))
        mask[r] = np.searchsorted(xs, lons) % 2 == 1
    return mask


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_1bit_png(path, on, rgb):
    """1-bit palette PNG: index 0 transparent, index 1 `rgb`."""
    h, w = on.shape
    packed = np.packbits(on.astype(np.uint8), axis=1)
    raw = b"".join(b"\x00" + packed[y].tobytes() for y in range(h))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 1, 3, 0, 0, 0)))
        f.write(png_chunk(b"PLTE", bytes([0, 0, 0, *rgb])))
        f.write(png_chunk(b"tRNS", bytes([0, 255])))
        f.write(png_chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(png_chunk(b"IEND", b""))


def main():
    cols = int(round((EAST - WEST) / RES))
    rows = int(round((NORTH - SOUTH) / RES))
    grid = np.zeros((rows, cols), dtype=np.uint8)  # row 0 = north

    tiles = [(lat, lon) for lat in range(int(SOUTH), int(NORTH), TILE) for lon in range(int(WEST) // TILE * TILE, int(EAST), TILE)]
    env = rasterio.Env(AWS_NO_SIGN_REQUEST="YES", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")
    with env, cf.ThreadPoolExecutor(8) as pool:
        found = 0
        for result in pool.map(lambda t: read_tile(*t), tiles):
            if result is None:
                continue
            lat, lon, classes = result
            found += 1
            n = classes.shape[0]
            # Place the tile, cropping what falls outside the grid.
            r0 = int(round((NORTH - (lat + TILE)) / RES))
            c0 = int(round((lon - WEST) / RES))
            rs, cs = max(r0, 0), max(c0, 0)
            re, ce = min(r0 + n, rows), min(c0 + n, cols)
            if rs < re and cs < ce:
                grid[rs:re, cs:ce] = classes[rs - r0 : re - r0, cs - c0 : ce - c0]
    print(f"{found} of {len(tiles)} WorldCover tiles cover the box")

    lons = WEST + (np.arange(cols) + 0.5) * RES
    lats = NORTH - (np.arange(rows) + 0.5) * RES
    grid[~india_mask(lons, lats)] = 0

    # Classifier grid: header, then 4 cells per byte, first cell in the low bits.
    flat = grid.ravel()
    pad = (-len(flat)) % 4
    flat = np.concatenate([flat, np.zeros(pad, dtype=np.uint8)]).reshape(-1, 4)
    packed = (flat[:, 0] | flat[:, 1] << 2 | flat[:, 2] << 4 | flat[:, 3] << 6).astype(np.uint8)
    bin_path = os.path.join(PUBLIC, "landcover", "india.bin")
    with open(bin_path, "wb") as f:
        # magic, version, west, north, res (float64 x3), cols, rows (uint32 x2)
        f.write(MAGIC + struct.pack("<I3d2I", 1, WEST, NORTH, RES, cols, rows))
        f.write(packed.tobytes())
    share = {k: float((grid == v).mean()) for k, v in (("cropland", 1), ("forest", 2))}
    print(f"wrote {bin_path}: {cols}x{rows} cells, {os.path.getsize(bin_path) / 1e6:.1f} MB, "
          f"cropland {share['cropland']:.1%} forest {share['forest']:.1%} of the box")

    # Farmland image, rows even in Web Mercator for a MapLibre image source.
    merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    width = int(round((EAST - WEST) / DISPLAY_RES))
    height = int(round(width * (merc(NORTH) - merc(SOUTH)) / math.radians(EAST - WEST)))
    ys = merc(NORTH) - (np.arange(height) + 0.5) * (merc(NORTH) - merc(SOUTH)) / height
    img_lats = np.degrees(2 * np.arctan(np.exp(ys)) - np.pi / 2)
    img_lons = WEST + (np.arange(width) + 0.5) * DISPLAY_RES
    ri = np.clip(((NORTH - img_lats) / RES).astype(int), 0, rows - 1)
    ci = np.clip(((img_lons - WEST) / RES).astype(int), 0, cols - 1)
    farmland = grid[ri[:, None], ci[None, :]] == 1
    png_path = os.path.join(PUBLIC, "landcover", "farmland.png")
    write_1bit_png(png_path, farmland, FARMLAND_RGB)
    print(f"wrote {png_path}: {width}x{height} px, {os.path.getsize(png_path) / 1e6:.2f} MB")

    # Known answers, so a missing tile or a class typo cannot pass as a plausible file.
    def at(lon, lat):
        return int(grid[int((NORTH - lat) / RES), int((lon - WEST) / RES)])

    checks = [
        ("farmland between Ludhiana and Jagraon", 75.60, 30.70, 1),
        ("Nallamala forest, Srisailam (AP/TS)", 78.60, 16.20, 2),
        ("Similipal forest (Odisha)", 86.35, 21.75, 2),
        ("Lahore, outside India", 74.35, 31.55, 0),
        ("Bay of Bengal", 88.0, 15.0, 0),
    ]
    for label, lon, lat, want in checks:
        got = at(lon, lat)
        if got != want:
            sys.exit(f"FAIL {label}: class {got}, expected {want}")
        print(f"ok  {label:40} {['other', 'cropland', 'forest'][got]}")


if __name__ == "__main__":
    main()
