#!/usr/bin/env bash
# Offline land-cover pipeline — clips ESA WorldCover to the four v1 regions and
# exports lightweight cropland/forest/other GeoJSON masks as static files.
#
# STUB. Finishing this is Joel's task (delegation/joel.md — offline land-cover pipeline).
# Runs in CI only, never in the live request path.
set -euo pipefail

OUT_DIR="${OUT_DIR:-pipeline/out}"
TMP_DIR="${TMP_DIR:-pipeline/tmp}"
REGIONS=(punjab bihar delhi telangana)

mkdir -p "$OUT_DIR" "$TMP_DIR"

# ESA WorldCover v200 (2021), 10m, Cloud-Optimized GeoTIFF. No credentials needed.
# CC-BY 4.0 — attribution is already in the app footer, keep it there.
aws s3 sync s3://esa-worldcover/v200/2021/map "$TMP_DIR" --no-sign-request

for region in "${REGIONS[@]}"; do
  echo "TODO: $region"
  # TODO: clip to region boundaries, export GeoJSON
  #       -> "$OUT_DIR/$region.geojson", each Feature tagged
  #          properties.landCover = cropland | forest | other
  #       Matches LandCoverMask in logic/src/types.ts — if the schema changes,
  #       change it there too and tell Jammy.
done
