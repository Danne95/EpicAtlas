#!/usr/bin/env python3
"""Preview/apply regional cleanup using a saved personal workspace."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
EPS = 1e-8


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def point(p):
    require(isinstance(p, list) and len(p) >= 2 and all(type(v) in (int, float) and math.isfinite(v) for v in p)
            and -180 <= p[0] <= 180 and -90 <= p[1] <= 90, 'Invalid travel coordinate; cleanup refused.')
    return p[:2]


def travel(data, origin, demo):
    require(isinstance(data, dict) and data.get('version') == 1, 'Expected a version 1 workspace.')
    records, ids = [], set()
    def identity(props):
        require(isinstance(props, dict) and isinstance(props.get('id'), str) and props['id'].strip()
                and props['id'] not in ids, 'Invalid/duplicate travel ID; cleanup refused.')
        ids.add(props['id'])
        return {'id': props['id'], 'origin': origin}
    for group in ('locations', 'roads', 'rail', 'water'):
        if group == 'water' and group not in data:
            continue
        collection = data.get(group)
        require(isinstance(collection, dict) and collection.get('type') == 'FeatureCollection'
                and collection.get('demo') is demo and isinstance(collection.get('features'), list), 'Invalid travel collection.')
        for feature in collection['features']:
            require(isinstance(feature, dict) and feature.get('type') == 'Feature', 'Invalid travel feature.')
            props, geometry = feature.get('properties'), feature.get('geometry')
            record = identity(props)
            require(isinstance(geometry, dict), 'Missing travel geometry.')
            if group == 'locations':
                require(isinstance(props.get('name'), str) and props['name'].strip(), 'Invalid location.')
                if geometry.get('type') == 'Point':
                    records.append({**record, 'kind': 'point', 'geometry': point(geometry.get('coordinates'))})
                else:
                    require(geometry.get('type') in ('Polygon', 'MultiPolygon'), 'Invalid city boundary.')
                    polygons = [geometry.get('coordinates')] if geometry['type'] == 'Polygon' else geometry.get('coordinates')
                    require(isinstance(polygons, list) and polygons, 'Empty city boundary.')
                    positions = []
                    for polygon in polygons:
                        require(isinstance(polygon, list) and polygon, 'Invalid city boundary polygon.')
                        for ring in polygon:
                            require(isinstance(ring, list) and len(ring) >= 4, 'Invalid city boundary ring.')
                            validated = [point(p) for p in ring]
                            require(validated[0] == validated[-1], 'City boundary ring must be closed.')
                            positions.extend(validated)
                    # Retain any pack overlapping the city's envelope, including packs fully inside it.
                    envelope = [[min(p[0] for p in positions), min(p[1] for p in positions)], [max(p[0] for p in positions), max(p[1] for p in positions)]]
                    records.append({**record, 'kind': 'line', 'geometry': envelope})
            else:
                coords = geometry.get('coordinates')
                require(geometry.get('type') == 'LineString' and isinstance(coords, list) and len(coords) >= 2
                        and props.get('mode') == ('road' if group == 'roads' else group), 'Invalid ground route.')
                records.append({**record, 'kind': 'line', 'geometry': [point(p) for p in coords]})
    collection = data.get('flights')
    require(isinstance(collection, dict) and collection.get('demo') is demo and isinstance(collection.get('flights'), list), 'Invalid flights.')
    for flight in collection['flights']:
        record = identity(flight)
        ends = []
        for key in ('from', 'to'):
            airport = flight.get(key)
            require(isinstance(airport, dict) and all(isinstance(airport.get(k), str) and airport[k].strip() for k in ('code', 'name')), 'Invalid flight airport.')
            ends.append(point(airport.get('coordinates')))
        records.append({**record, 'kind': 'flight', 'geometry': ends})
    return records


def inside(p, bounds):
    w, s, e, n = bounds
    return s-EPS <= p[1] <= n+EPS and any(w-EPS <= lon <= e+EPS for lon in (p[0], p[0]+360, p[0]-360))


def ground_overlap(points, bounds):
    w, s, e, n = bounds
    for a, b in zip(points, points[1:]):
        # Conservative segment envelopes retain uncertain corner/meridian crossings.
        west, east = (-180, 180) if abs(a[0]-b[0]) > 180 else (min(a[0], b[0]), max(a[0], b[0]))
        if max(a[1], b[1])+EPS >= s and min(a[1], b[1])-EPS <= n and any(east+shift+EPS >= w and west+shift-EPS <= e for shift in (-360, 0, 360)):
            return True
    return False


def flight_overlap(ends, bounds):
    """Find endpoints or intersections of a spherical arc with the rectangle edges."""
    if any(inside(p, bounds) for p in ends):
        return True
    def vector(p):
        lon, lat = map(math.radians, p)
        return [math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat)]
    a, b = map(vector, ends)
    cosine = max(-1, min(1, sum(x*y for x, y in zip(a, b))))
    angle = math.acos(cosine)
    if angle < 1e-8:
        return ground_overlap(ends, bounds)
    if math.pi-angle < 1e-7:
        return True  # An ambiguous arc cannot release a pack safely.
    u = [(y-x*cosine)/math.sin(angle) for x, y in zip(a, b)]
    candidates = []
    def roots(A, B, C):
        radius = math.hypot(A, B)
        if radius < 1e-12:
            # Arc on an edge: the other edges/endpoints normally resolve it.
            if abs(C) < 1e-12:
                candidates.extend([angle/2])
            return
        if abs(C) > radius+1e-12:
            return
        phase, offset = math.atan2(B, A), math.acos(max(-1, min(1, C/radius)))
        for root in (phase-offset, phase+offset):
            for cycle in (-1, 0, 1):
                t = root+cycle*2*math.pi
                if -1e-10 <= t <= angle+1e-10:
                    candidates.append(max(0, min(angle, t)))
    w, s, e, n = bounds
    for lat in (s, n):
        roots(a[2], u[2], math.sin(math.radians(lat)))
    for lon in (w, e):
        lon = math.radians(lon)
        roots(a[1]*math.cos(lon)-a[0]*math.sin(lon), u[1]*math.cos(lon)-u[0]*math.sin(lon), 0)
    for t in candidates:
        p = [x*math.cos(t)+y*math.sin(t) for x, y in zip(a, u)]
        lonlat = [math.degrees(math.atan2(p[1], p[0])), math.degrees(math.atan2(p[2], math.hypot(p[0], p[1])))]
        if inside(lonlat, bounds):
            return True
    return False


def local_file(directory, name):
    require(re.fullmatch(r'[a-zA-Z0-9_-]+\.(pmtiles|txt|json)', name), 'Unsafe regional filename.')
    path = directory / name
    require(not path.is_symlink() and path.resolve().parent == directory, 'Regional files must stay inside the resolved regional directory.')
    return path


def region_scope(regions):
    regions = regions.resolve(strict=True)
    require(regions.name.lower() == 'regions' and regions.parent.name.lower() == 'maps'
            and 'world' not in {p.lower() for p in regions.parts}, 'Use a maps/regions directory; world map cleanup is forbidden.')
    return regions


def make_plan(workspace, regions):
    regions = region_scope(regions)
    workspace = workspace.resolve(strict=True)
    require(not workspace.is_relative_to(regions), 'Keep travel backups outside regional map assets.')
    records = travel(read(workspace), 'personal', False)
    inputs = [{'path': str(workspace), 'sha256': sha(workspace)}]
    manifest_path = regions/'manifest.json'
    require(not manifest_path.is_symlink(), 'Manifest symlinks are unsupported.')
    manifest = read(manifest_path)
    require(isinstance(manifest, dict) and manifest.get('version') == 1 and isinstance(manifest.get('packs'), list), 'Invalid region manifest.')
    packs, ids, files, archive_paths = [], set(), set(), set()
    for pack in manifest['packs']:
        require(isinstance(pack, dict) and isinstance(pack.get('id'), str) and re.fullmatch(r'[a-z0-9-]+', pack['id']) and pack['id'] not in ids, 'Invalid/duplicate pack ID.')
        ids.add(pack['id'])
        require(isinstance(pack.get('file'), str) and pack['file'].endswith('.pmtiles') and pack['file'] not in files, 'Invalid/duplicate archive filename.')
        files.add(pack['file'])
        archive = local_file(regions, pack['file'])
        require(archive.resolve() not in archive_paths, 'Manifest entries must not share an archive, including filename case aliases.')
        archive_paths.add(archive.resolve())
        bounds = pack.get('bounds')
        require(isinstance(bounds, list) and len(bounds) == 4 and all(type(v) in (int, float) and math.isfinite(v) for v in bounds), 'Invalid pack bounds.')
        w, s, e, n = bounds
        require(-180 <= w < e <= 180 and -85.051129 <= s < n <= 85.051129, 'Invalid pack coverage.')
        with archive.open('rb') as handle:
            header = handle.read(127)
        require(len(header) == 127 and header[:8] == b'PMTiles\x03' and header[99] == 1, 'Expected a local PMTiles v3 MVT archive.')
        actual_bounds = [v/1e7 for v in struct.unpack_from('<4i', header, 102)]
        require(all(abs(x-y) <= 1e-7 for x, y in zip(bounds, actual_bounds)) and header[100] == pack.get('minZoom') and header[101] == pack.get('maxZoom'), 'Manifest coverage differs from archive header; cleanup refused.')
        checksum = sha(archive)
        require(checksum == pack.get('sha256') and archive.stat().st_size == pack.get('sizeBytes'), 'Archive size/hash differs from manifest; cleanup refused.')
        refs = [dict(id=r['id'], origin=r['origin']) for r in records if
                (inside(r['geometry'], bounds) if r['kind'] == 'point' else ground_overlap(r['geometry'], bounds) if r['kind'] == 'line' else flight_overlap(r['geometry'], bounds))]
        artifacts = [{'file': archive.name, 'sha256': checksum, 'sizeBytes': archive.stat().st_size}]
        for suffix in ('-LICENSE.txt', '-provenance.json'):
            sidecar = local_file(regions, archive.stem+suffix)
            if sidecar.exists():
                require(str(sidecar.resolve()) not in {item['path'] for item in inputs}, 'Cleanup must not remove a travel input file.')
                artifacts.append({'file': sidecar.name, 'sha256': sha(sidecar), 'sizeBytes': sidecar.stat().st_size})
        packs.append({'id': pack['id'], 'references': refs, 'unused': not refs, 'artifacts': artifacts})
    return {'version': 1, 'regionsDirectory': str(regions), 'inputs': inputs,
            'manifestSha256': sha(manifest_path), 'packs': packs}, manifest


def apply_plan(expected, workspace, regions):
    directory = region_scope(regions)
    lock = directory/'.region-build.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.close(fd)
    try:
        current, manifest = make_plan(workspace, regions)
        require(expected == current, 'Plan is stale or modified. Generate and review a new plan before applying.')
        candidates = [pack for pack in current['packs'] if pack['unused']]
        if not candidates:
            print('No unused packs. Nothing removed.')
            return
        stage = Path(tempfile.mkdtemp(prefix='.cleanup-stage-', dir=directory)).resolve()
        require(stage.parent == directory, 'Staging must remain inside regional directory.')
        moved, committed = [], False
        try:
            for pack in candidates:
                for artifact in pack['artifacts']:
                    source = local_file(directory, artifact['file'])
                    destination = stage/source.name
                    os.replace(source, destination)
                    moved.append((source, destination))
            removed = {pack['id'] for pack in candidates}
            refs = {pack['id']: sorted({ref['id'] for ref in pack['references']}) for pack in current['packs']}
            manifest['packs'] = [{**pack, 'travelReferences': refs[pack['id']]} for pack in manifest['packs'] if pack['id'] not in removed]
            replacement = stage/'manifest.json'
            replacement.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
            os.replace(replacement, directory/'manifest.json')
            committed = True
        finally:
            if not committed:
                for original, staged in reversed(moved):
                    os.replace(staged, original)
                replacement = stage/'manifest.json'
                if replacement.exists():
                    replacement.unlink()
            else:
                try:
                    for _, staged in moved:
                        staged.unlink()
                except OSError as error:
                    raise ValueError(f'Manifest updated, but staged files could not be purged. Inspect {stage} before retrying: {error}') from error
            stage.rmdir()
        print(f"Removed {len(candidates)} unused regional pack(s). Referenced packs and world map preserved.")
    finally:
        lock.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('plan', 'apply'))
    parser.add_argument('--workspace', required=True, type=Path, help='Current exported personal workspace, including all saved records')
    parser.add_argument('--regions-dir', type=Path, default=ROOT/'public/maps/regions')
    parser.add_argument('--plan', required=True, type=Path, help='New preview file for plan, reviewed file for apply')
    args = parser.parse_args()
    try:
        if args.action == 'plan':
            preview, _ = make_plan(args.workspace, args.regions_dir)
            plan_path = args.plan.resolve()
            require(not plan_path.is_relative_to(args.regions_dir.resolve()), 'Keep preview plans outside map assets.')
            require('world' not in {part.lower() for part in plan_path.parts}, 'Preview plans must not be written under a world map directory.')
            args.plan.parent.mkdir(parents=True, exist_ok=True)
            with args.plan.open('x', encoding='utf-8') as handle:
                json.dump(preview, handle, ensure_ascii=False, indent=2)
                handle.write('\n')
            for pack in preview['packs']:
                references = ', '.join(f"{ref['origin']}:{ref['id']}" for ref in pack['references'])
                print(f"{pack['id']}: {'UNUSED - eligible for removal' if pack['unused'] else 'KEEP - '+references}")
            print(f"Preview saved: {args.plan}. Review it before running apply.")
        else:
            apply_plan(read(args.plan), args.workspace, args.regions_dir)
        return 0
    except (OSError, ValueError, KeyError, TypeError, OverflowError) as error:
        print(f'Regional cleanup stopped: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
