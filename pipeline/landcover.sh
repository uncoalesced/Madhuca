#!/usr/bin/env bash
# Offline land-cover pipeline — clips ESA WorldCover to the v1 regions and exports
# one cropland/forest GeoJSON mask per region.
#
# Runs in CI only (.github/workflows/landcover.yml), never in the live request path
# (docs/MASTER.md §4). Needs gdal-bin, python3-gdal and jq.
#
#   ./pipeline/landcover.sh                    # all four regions
#   ./pipeline/landcover.sh punjab             # just one
#   ./pipeline/landcover.sh list-tiles punjab  # print the tiles it would read
#
# ESA WorldCover v200 (2021), 10m, CC-BY 4.0. Attribution is in the frontend footer
# and the README — keep it there.
set -euo pipefail

OUT_DIR="${OUT_DIR:-pipeline/out}"
TMP_DIR="${TMP_DIR:-pipeline/tmp}"
ALL_REGIONS=(punjab bihar delhi telangana)

# WorldCover tiles are 3°x3°, named by their lower-left corner.
TILE_SIZE=3
S3_MAP="/vsis3/esa-worldcover/v200/2021/map"

# Output resolution in degrees. 0.0035° is roughly 390m, which is about the size of
# a VIIRS pixel — there is no point resolving land cover finer than the hotspot it
# is being used to classify, and every step finer multiplies the polygon count and
# the file a phone has to download.
RES=0.0035

# WorldCover class codes we keep. Everything else is 'other' and is *not* written:
# a point that hits no polygon is 'other' by definition, and dropping those features
# is most of the file size. See pipeline/README.md — Jammy's classifier has to treat
# a miss as 'other' rather than as an error.
CROPLAND_CLASS=40
FOREST_CLASS=10

# Region bounding boxes, WGS84, "west south east north".
#
# KEEP IN SYNC with REGION_BBOX in logic/src/hotspots.ts. The same four boxes decide
# which FIRMS hotspots get fetched, and a mask that does not cover the box the
# hotspots came from produces silent 'other' classifications at the edges. They are
# duplicated because one side is TypeScript that ships to Workers and the other is
# shell that only ever runs in CI; there is no shared file worth inventing for four
# lines of geography that will not change.
bbox_for() {
  case "$1" in
    punjab)    echo "73.8 29.5 76.95 32.55" ;;
    bihar)     echo "83.3 24.2 88.3 27.55" ;;
    delhi)     echo "76.8 28.4 77.4 28.9" ;;
    telangana) echo "77.2 15.8 81.85 19.95" ;;
    *) echo "unknown region: $1" >&2; return 1 ;;
  esac
}

# Every WorldCover tile a bbox touches, as tile names like N30E075.
#
# All four regions are north of the equator and east of Greenwich, so this handles
# N/E only and refuses anything else loudly rather than emitting a tile name that
# does not exist and failing later with a confusing GDAL error.
tiles_for() {
  local west=$1 south=$2 east=$3 north=$4
  awk -v w="$west" -v s="$south" -v e="$east" -v n="$north" -v size="$TILE_SIZE" '
    BEGIN {
      if (w < 0 || s < 0) {
        print "tiles_for: only northern/eastern hemisphere bboxes are supported" > "/dev/stderr"
        exit 1
      }
      for (lat = int(s / size) * size; lat <= int(n / size) * size; lat += size)
        for (lon = int(w / size) * size; lon <= int(e / size) * size; lon += size)
          printf "N%02dE%03d\n", lat, lon
    }'
}

build_region() {
  local region=$1
  read -r west south east north <<<"$(bbox_for "$region")"

  local sources=()
  local tile
  while read -r tile; do
    sources+=("$S3_MAP/ESA_WorldCover_10m_2021_v200_${tile}_Map.tif")
  done < <(tiles_for "$west" "$south" "$east" "$north")

  echo "==> $region: ${#sources[@]} tile(s), bbox $west $south $east $north"

  # Read the COGs straight off S3 rather than syncing them. The whole v200 map is
  # terabytes; gdalwarp fetches only the byte ranges it needs, and -ovr AUTO lets it
  # read a prebuilt overview level instead of 10m pixels it is about to throw away.
  #
  # ponytail: that means the mask inherits whatever resampling ESA used to build
  # those overviews. Fine for a 390m categorical mask; if a class boundary ever
  # looks wrong at the edges, force -ovr NONE and accept the slower run.
  gdalbuildvrt -q -overwrite "$TMP_DIR/$region.vrt" "${sources[@]}"

  gdalwarp -q -overwrite \
    -te "$west" "$south" "$east" "$north" -te_srs EPSG:4326 \
    -tr "$RES" "$RES" -r mode \
    -ot Byte -of GTiff -co COMPRESS=DEFLATE -co TILED=YES \
    "$TMP_DIR/$region.vrt" "$TMP_DIR/$region.tif"

  # ponytail: polygonizes every class and then filters, rather than masking first.
  # One extra pass over a raster this small is cheaper than another GDAL dependency.
  # If a region ever runs out of memory here, mask with gdal_calc.py before this step.
  gdal_polygonize.py -q "$TMP_DIR/$region.tif" \
    -f GeoJSON "$TMP_DIR/$region-raw.geojson" "${region}_raw" DN

  # -simplify is one output pixel, so it only strips the staircase vertices that
  # polygonizing a raster produces. It does not move a boundary by more than a pixel.
  ogr2ogr -q -f GeoJSON -simplify "$RES" \
    -dialect SQLite \
    -sql "SELECT CASE DN
                   WHEN $CROPLAND_CLASS THEN 'cropland'
                   WHEN $FOREST_CLASS   THEN 'forest'
                 END AS landCover,
                 geometry
          FROM ${region}_raw
          WHERE DN IN ($CROPLAND_CLASS, $FOREST_CLASS)" \
    "$TMP_DIR/$region-features.geojson" "$TMP_DIR/$region-raw.geojson"

  # Wrap as LandCoverMask (logic/src/types.ts): { region, features }. ogr2ogr emits a
  # bare FeatureCollection, which is the `features` field, not the whole mask.
  jq -c --arg region "$region" \
    '{region: $region, features: .}' \
    "$TMP_DIR/$region-features.geojson" >"$OUT_DIR/$region.json"

  local count size
  count=$(jq '.features.features | length' "$OUT_DIR/$region.json")
  size=$(du -h "$OUT_DIR/$region.json" | cut -f1)
  echo "    $OUT_DIR/$region.json — $count features, $size"

  if [ "$count" -eq 0 ]; then
    echo "    FAIL: no cropland or forest found in $region, which cannot be right" >&2
    return 1
  fi

  # Nothing outside the two classes may reach the output, because a consumer that
  # sees an unexpected landCover value has no defined behaviour for it.
  local unexpected
  unexpected=$(jq -r '[.features.features[].properties.landCover
                       | select(. != "cropland" and . != "forest")] | length' \
                 "$OUT_DIR/$region.json")
  if [ "$unexpected" -ne 0 ]; then
    echo "    FAIL: $unexpected feature(s) with an unexpected landCover value" >&2
    return 1
  fi
}

main() {
  if [ "${1:-}" = "list-tiles" ]; then
    shift
    read -r west south east north <<<"$(bbox_for "${1:?list-tiles needs a region}")"
    tiles_for "$west" "$south" "$east" "$north"
    return 0
  fi

  local regions=("$@")
  [ ${#regions[@]} -eq 0 ] && regions=("${ALL_REGIONS[@]}")

  mkdir -p "$OUT_DIR" "$TMP_DIR"

  # Read the public bucket without credentials. AWS_NO_SIGN_REQUEST is the /vsis3/
  # equivalent of the CLI's --no-sign-request.
  export AWS_NO_SIGN_REQUEST=YES
  export GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR
  export CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif
  export GDAL_CACHEMAX=512

  local region
  for region in "${regions[@]}"; do
    build_region "$region"
  done
}

main "$@"
