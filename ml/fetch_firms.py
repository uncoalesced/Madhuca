"""Download the NASA FIRMS VIIRS (Suomi NPP) detections for one region box.

    FIRMS_MAP_KEY=... python ml/fetch_firms.py south 2019-01-01 2026-09-28

Offline only (MASTER.md 2026-09-28 decision): run by hand or by the manual ml-risk
workflow, never on the request path. Standard-processing archive (VIIRS_SNPP_SP)
up to its last date, near-real-time (VIIRS_SNPP_NRT) after it. Each 5-day chunk is
cached under ml/data/firms/<region>/, so a re-run only fetches what is missing.
The key is read from the environment and never written to disk or logged.
"""

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SP_LAST = dt.date(2026, 6, 30)  # FIRMS data_availability for VIIRS_SNPP_SP on 2026-09-29
CHUNK_DAYS = 5  # the area API's maximum day range ("Invalid day range. Expects [1..5]")
API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
HERE = os.path.dirname(os.path.abspath(__file__))


def fetch(url: str) -> str:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as res:
                return res.read().decode("utf-8")
        except urllib.error.HTTPError as err:
            if err.code < 500:  # a 4xx will not fix itself; FIRMS's body says why (never print the URL: it holds the key)
                raise RuntimeError(f"FIRMS HTTP {err.code}: {err.read().decode('utf-8', 'replace')[:200]}") from None
            if attempt == 3:
                raise RuntimeError(f"FIRMS HTTP {err.code} after retries") from None
            time.sleep(5 * (attempt + 1))
        except Exception as err:  # network hiccup: back off, then give up loudly
            if attempt == 3:
                raise RuntimeError(f"FIRMS request failed after retries: {type(err).__name__}") from None
            time.sleep(5 * (attempt + 1))
    raise AssertionError("unreachable")


def main() -> None:
    region, start, end = sys.argv[1], dt.date.fromisoformat(sys.argv[2]), dt.date.fromisoformat(sys.argv[3])
    key = os.environ.get("FIRMS_MAP_KEY")
    if not key:
        sys.exit("FIRMS_MAP_KEY is not set")
    # The box comes from export_cells.ts, i.e. REGION_BBOX in logic/, never a copy here.
    cells_path = os.path.join(HERE, "data", f"{region}-cells.json")
    if not os.path.exists(cells_path):
        sys.exit(f"run `node ml/export_cells.ts {region}` first")
    with open(cells_path, encoding="utf-8") as f:
        bbox = ",".join(str(v) for v in json.load(f)["bbox"])
    out = os.path.join(HERE, "data", "firms", region)
    os.makedirs(out, exist_ok=True)

    chunks = []
    day = start
    while day <= end:
        span = min(CHUNK_DAYS, (end - day).days + 1)
        source = "VIIRS_SNPP_SP" if day <= SP_LAST else "VIIRS_SNPP_NRT"
        if source == "VIIRS_SNPP_SP":
            span = min(span, (SP_LAST - day).days + 1)  # never straddle the SP/NRT switch
        chunks.append((source, day, span, os.path.join(out, f"{source}_{day.isoformat()}_{span}.csv")))
        day += dt.timedelta(days=span)
    missing = [c for c in chunks if not os.path.exists(c[3])]

    def get(chunk):
        source, day, span, path = chunk
        text = fetch(f"{API}/{key}/{source}/{bbox}/{span}/{day.isoformat()}")
        if not text.startswith("latitude,") and not text.startswith("country_id,"):
            # FIRMS answers some errors as plain text with HTTP 200 ("Invalid MAP_KEY.").
            raise RuntimeError(f"FIRMS returned no CSV for {source} {day}: {text[:120]!r}")
        with open(path + ".part", "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(path + ".part", path)  # atomic: an interrupted run never leaves half a chunk

    # Four at a time. FIRMS is slow on peak-season chunks (~1 MB, over a minute each), so
    # this is latency-bound. A request over the Telangana / AP box costs ~10 of the key's
    # 5000 transactions per 10 minutes and the live site shares the key; four workers
    # stay around a third of that budget.
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, _ in enumerate(pool.map(get, missing), 1):
            if i % 50 == 0:
                print(f"  {i}/{len(missing)} fetched", flush=True)

    rows = 0
    for _, _, _, path in chunks:
        with open(path, encoding="utf-8") as f:
            rows += max(0, sum(1 for _ in f) - 1)
    print(f"{region}: {len(missing)} chunks fetched, {len(chunks) - len(missing)} cached, {rows} detections, {start}..{end}")


if __name__ == "__main__":
    main()
