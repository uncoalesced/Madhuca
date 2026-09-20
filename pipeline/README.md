# pipeline

The only real GIS processing in the project, and it runs **offline in CI** — never
in the user-facing request path (`docs/MASTER.md` §4).

`landcover.sh` pulls ESA WorldCover tiles, clips them to Punjab / Bihar / Delhi /
Telangana, and exports one cropland/forest/other GeoJSON mask per region. The live
app and Jammy's classification module read those static files.

Run by `.github/workflows/landcover.yml`. Stub — see `delegation/joel.md`.
