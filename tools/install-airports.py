"""Explicitly install an offline airport-code catalogue; no travel inputs are sent."""
import csv
import hashlib
import io
import json
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parent.parent
url = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
raw = urlopen(url, timeout=60).read()
airports = {}
for row in csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))):
    code = row['iata_code'].strip().upper()
    if len(code) != 3 or not code.isalpha() or row['type'] == 'closed':
        continue
    lon, lat = float(row['longitude_deg']), float(row['latitude_deg'])
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise ValueError('Invalid airport coordinate')
    airports.setdefault(code, []).append({'code': code, 'name': row['name'], 'coordinates': [lon, lat]})
if len(airports) < 5000:
    raise ValueError('Incomplete airport catalogue; existing data preserved')
directory = root / 'private/maps/airports'
directory.mkdir(parents=True, exist_ok=True)
target = directory / 'catalogue.json'
temporary = directory / 'catalogue.json.tmp'
temporary.write_text(json.dumps({'source': url, 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'license': 'Public domain', 'airports': airports}, ensure_ascii=False), encoding='utf-8')
temporary.replace(target)
print(f'Installed {len(airports)} airport codes privately for offline lookup.')
