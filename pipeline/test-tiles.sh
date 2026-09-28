#!/usr/bin/env bash
# Checks the one piece of real arithmetic in landcover.sh: turning a region bbox
# into the list of 3°x3° ESA WorldCover tiles that cover it.
#
#   ./pipeline/test-tiles.sh
#
# This is the part worth a check because it is silently wrong when it is wrong.
# Missing a tile does not fail the run — gdalwarp happily produces a mask with a
# blank strip down one side, and every hotspot in that strip classifies as 'other'.
# Everything else in the pipeline is GDAL doing GDAL's job, and is checked by
# actually running the workflow.
#
# No GDAL needed: `list-tiles` does the arithmetic and nothing else.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANDCOVER="$SCRIPT_DIR/landcover.sh"

failures=0

expect_tiles() {
  local region=$1 expected=$2 actual
  actual=$(bash "$LANDCOVER" list-tiles "$region" | sort | tr '\n' ' ' | sed 's/ $//')

  if [ "$actual" = "$expected" ]; then
    echo "ok   $region -> $actual"
  else
    echo "FAIL $region"
    echo "       expected: $expected"
    echo "       actual:   $actual"
    failures=$((failures + 1))
  fi
}

expect_fail() {
  local label=$1
  shift
  if "$@" >/dev/null 2>&1; then
    echo "FAIL $label — expected a non-zero exit"
    failures=$((failures + 1))
  else
    echo "ok   $label"
  fi
}

# Punjab spans the 30°N tile line and the 75°E tile line, so it needs all four
# surrounding tiles. This is the case that catches an off-by-one in either loop.
expect_tiles punjab "N27E072 N27E075 N30E072 N30E075"

# Bihar spans three longitude bands and two latitude bands.
expect_tiles bihar "N24E081 N24E084 N24E087 N27E081 N27E084 N27E087"

# Delhi sits entirely inside one tile. If the loops ever stop being inclusive of
# the lower bound, this is the one that goes empty.
expect_tiles delhi "N27E075"

# Telangana + Andhra Pradesh: three latitude bands, four longitude bands.
expect_tiles telangana "N12E075 N12E078 N12E081 N12E084 N15E075 N15E078 N15E081 N15E084 N18E075 N18E078 N18E081 N18E084"

expect_fail "an unknown region is refused" bash "$LANDCOVER" list-tiles atlantis

echo
if [ "$failures" -eq 0 ]; then
  echo "all tile checks passed"
else
  echo "$failures tile check(s) failed"
  exit 1
fi
