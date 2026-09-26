#!/usr/bin/env bash
# Generate the 14 demo photos (AGENTS.md §7.4): 2 per photo-evidenced show (d01–d06) + 2 decoys.
# Blank dark-gradient JPEGs (Pillow) with fabricated EXIF (exiftool). No real photos.
# Coordinates/timestamps are identical to api/tests/test_matcher.py.
# Offsets are the real ones for each date: EST (-05:00) Nov–early Mar, EDT (-04:00) otherwise.
set -euo pipefail
cd "$(dirname "$0")"
PYTHON="${PYTHON:-python3}"

#      file                 lat       lng        local time            offset
PHOTOS="
d01_1.jpg               33.7588   -84.3911   2025:10:11 21:30:00   -04:00
d01_2.jpg               33.7584   -84.3915   2025:10:11 21:40:00   -04:00
d02_1.jpg               33.7526   -84.3646   2025:11:22 22:00:00   -05:00
d02_2.jpg               33.7522   -84.3650   2025:11:22 22:10:00   -05:00
d03_1.jpg               33.7651   -84.3490   2026:01:17 21:45:00   -05:00
d03_2.jpg               33.7647   -84.3494   2026:01:17 21:55:00   -05:00
d04_1.jpg               33.7576   -84.3960   2026:02:28 21:15:00   -05:00
d04_2.jpg               33.7570   -84.3966   2026:02:28 21:25:00   -05:00
d05_1.jpg               33.7832   -84.4106   2026:04:04 22:15:00   -04:00
d05_2.jpg               33.7828   -84.4110   2026:04:04 22:25:00   -04:00
d06_1.jpg               33.8901   -84.4683   2026:06:13 22:20:00   -04:00
d06_2.jpg               33.8895   -84.4689   2026:06:13 22:30:00   -04:00
decoy_piedmont.jpg      33.7851   -84.3738   2025:12:06 21:00:00   -05:00
decoy_masquerade.jpg    33.7522   -84.3915   2026:03:14 15:00:00   -04:00
"

command -v exiftool >/dev/null || { echo "exiftool missing: brew install exiftool" >&2; exit 1; }

echo "$PHOTOS" | awk 'NF' | while read -r file lat lng day time offset; do
  "$PYTHON" - "$file" <<'PY'
import sys, zlib
from PIL import Image
name = sys.argv[1]
seed = zlib.crc32(name.encode())
top, bottom = (10 + seed % 20, 10, 30 + seed % 40), (0, 0, 0)
img = Image.new("RGB", (1200, 1600))
px = img.load()
for y in range(1600):
    t = y / 1599
    c = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    for x in range(1200):
        px[x, y] = c
img.save(name, "JPEG", quality=70)
PY
  exiftool -q -overwrite_original \
    -GPSLatitude="$lat" -GPSLatitudeRef=N -GPSLongitude="${lng#-}" -GPSLongitudeRef=W \
    -DateTimeOriginal="$day $time" -OffsetTimeOriginal="$offset" -Make=Apple -Model="iPhone 15" "$file"
done
echo "wrote $(ls *.jpg | wc -l | tr -d ' ') photos"
