# pipeline

The only real GIS processing in the project, and it runs **offline in CI** — never
in the user-facing request path (`docs/MASTER.md` §4).

`landcover.sh` reads ESA WorldCover, clips it to Punjab / Bihar / Delhi / Telangana,
and exports one land-cover mask per region. The live app and Jammy's classification
module read those static files.

## Running it

Manual only, from the Actions tab → **landcover** → Run workflow. Two inputs:

| Input | What |
|---|---|
| `regions` | Space separated. Defaults to all four. Pass one region for a cheap test run. |
| `publish` | Off by default. On, it commits the masks to `frontend/public/landcover/`. |

Every run uploads the masks as a `landcover-masks` artifact whether or not it
publishes, so you can look at the output before committing it.

Locally you need `gdal-bin`, `python3-gdal` and `jq`:

```bash
./pipeline/landcover.sh                    # all four regions
./pipeline/landcover.sh punjab             # just one
./pipeline/landcover.sh list-tiles punjab  # the tiles it would read, no GDAL needed
./pipeline/test-tiles.sh                   # checks the bbox -> tile arithmetic
```

## What the output looks like

One file per region, `frontend/public/landcover/<region>.json`, shaped as
`LandCoverMask` from `logic/src/types.ts`:

```json
{
  "region": "punjab",
  "features": {
    "type": "FeatureCollection",
    "features": [
      { "type": "Feature",
        "properties": { "landCover": "cropland" },
        "geometry": { "type": "Polygon", "coordinates": [] } }
    ]
  }
}
```

### Read this before writing the classifier

**Only `cropland` and `forest` polygons are written. A point that hits nothing is
`other`.** That is not an error case, it is the third value — built-up, water, bare
ground, grassland and everything else WorldCover distinguishes all collapse to the
same answer for our purposes, and writing them out was most of the file size for
information nobody reads. A lookup that throws on a miss will classify half of Delhi
as a failure.

Two more things that are decisions, not accidents:

- **Resolution is 0.0035°, about 390m.** That is roughly one VIIRS pixel. Resolving
  land cover finer than the hotspot being classified buys nothing and multiplies both
  the polygon count and what a phone downloads.
- **Grassland and shrubland are `other`, not `forest`.** WorldCover class 10 (tree
  cover) is the only thing mapped to `forest`. Scrub fires in Telangana will therefore
  land in `other`. If that turns out to matter for classification, say so — it is a
  one-line change here, not something to work around downstream.

## How it works

1. Work out which 3°×3° WorldCover tiles each region's bbox touches.
2. `gdalwarp` reads those Cloud-Optimized GeoTIFFs **straight off S3** over `/vsis3/`
   with `AWS_NO_SIGN_REQUEST`, crops to the bbox and resamples to 390m with `mode`.
   Nothing is synced: the full v200 map is terabytes, and GDAL fetches only the byte
   ranges it needs.
3. Polygonize, keep classes 40 and 10, simplify by one pixel.
4. Wrap as `LandCoverMask` and assert the result is non-empty and carries no
   unexpected `landCover` value.

The region bounding boxes are duplicated in `logic/src/hotspots.ts` as `REGION_BBOX`
— **keep the two in sync.** The same boxes decide which FIRMS hotspots get fetched,
and a mask that does not cover the box the hotspots came from silently classifies the
edges as `other`.

## India border (`india-border.mjs`)

FIRMS is queried by the same bounding boxes, and the Punjab box reaches into Pakistan
and the Bihar box into Nepal. `logic/src/india-border.ts` holds India's border clipped
to each box, and `fetchHotspots` drops any detection outside it.

It is generated once, by hand, from Natural Earth 1:10m admin-0 (India point of view,
public domain). Regenerate it if `REGION_BBOX` changes:

```bash
curl -sSLo /tmp/ne_ind.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_ind.geojson
node pipeline/india-border.mjs /tmp/ne_ind.geojson
```

Simplified at 0.001 deg (about 100 m). At 0.005 deg a real fire 500 m from the Punjab
border landed on the wrong side, so do not loosen it to save vertices: the whole file
is about 700 vertices and a region check costs well under 1 ms.

## Attribution

ESA WorldCover v200 (2021), CC-BY 4.0. © ESA WorldCover project 2021 / Contains
modified Copernicus Sentinel data. The attribution in the frontend footer and the
README is a licence condition — do not remove it while restyling.
