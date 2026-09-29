# pipeline

The only real GIS processing in the project, and it runs **offline** — never in the
user-facing request path (`docs/MASTER.md` §4). Every script here writes static files
under `frontend/public/` that the Worker and the map read, and each one asserts known
answers before it writes, so a missing tile or a wrong ring cannot pass as a plausible file.

| Script | Writes | Run |
|---|---|---|
| `boundaries.mjs` | `boundaries/borders.json`, `state-lines.json`, `states.json`, `states.bin` | by hand, when a boundary source changes |
| `landcover_india.py` | `landcover/india.bin`, `landcover/farmland.png` | Actions → **landcover** → Run workflow, or by hand |
| `towns.mjs` | `frontend/src/towns.ts` | by hand, after `boundaries.mjs` |

## Boundaries (`boundaries.mjs`)

India's official boundary: J&K and Ladakh include PoK, Gilgit-Baltistan and Aksai Chin;
Arunachal Pradesh is India. The basemap's own de-facto lines are hidden in `MapView.ts`.

- Country borders: Natural Earth 1:10m admin-0, India point of view (public domain).
- States and UTs: DataMeet `States/Admin2` (Survey of India outline, 36 states/UTs,
  Ladakh separate). Attributed in the app footer.
- `states.bin`: which state every point is in, 0.001 deg (~110 m) runs per row, from the
  **unsimplified** rings. It is the India-border filter for FIRMS rows (a fire 500 m from
  the Punjab border once landed on the wrong side at 0.005 deg), the zone filter, the
  stubble-belt check and the panel's default language. Format in `logic/src/geo.ts`.

```bash
curl -sSLo /tmp/ne_ind.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_ind.geojson
for e in shp dbf; do curl -sSLo /tmp/Admin2.$e https://raw.githubusercontent.com/datameet/maps/master/States/Admin2.$e; done
node pipeline/boundaries.mjs /tmp/ne_ind.geojson /tmp/Admin2
```

## Land cover (`landcover_india.py`)

ESA WorldCover v200 (2021) for all of India in one pass, read straight off the public S3
bucket at a prebuilt overview level (about 20 s, 102 tiles). Needs `pip install rasterio numpy`.

- `india.bin`: 2 bits per 0.005 deg cell (~550 m, about one VIIRS pixel): 0 other,
  1 cropland (class 40), 2 forest (class 10). The classifier's lookup is one array read.
- `farmland.png`: cropland only, 1-bit palette, rows even in Web Mercator.

**A land-cover miss is `other`, not an error.** Built-up, water, bare ground, grassland,
shrubland and mangrove (class 95) are all `other`; only tree cover is `forest`, so
Telangana scrub fires land in `other`. `other` is not evidence of crop-burning.

## Attribution

ESA WorldCover v200 (2021), CC-BY 4.0. © ESA WorldCover project 2021 / Contains
modified Copernicus Sentinel data. DataMeet and Natural Earth for boundaries. The
attributions in the frontend footer and the README are licence conditions — do not
remove them while restyling.
