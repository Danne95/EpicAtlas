#!/usr/bin/env python3
"""Normalize local GPX, KML, or WGS84 GeoJSON into EpicAtlas road/rail/water features."""
import argparse
import json
import math
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET


class ImportErrorMessage(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ImportErrorMessage(message)


def coordinate(values, text=False):
    require(isinstance(values, (list, tuple)) and len(values) >= 2, "Each position needs longitude and latitude.")
    if text:
        values = [float(value) for value in values]
    require(all(type(value) in (int, float) and math.isfinite(value) for value in values), "Positions must contain finite numbers.")
    lon, lat = values[:2]
    require(-180 <= lon <= 180 and -90 <= lat <= 90, "Coordinates are outside longitude/latitude ranges.")
    return [lon, lat]


def tag(element):
    return element.tag.rsplit("}", 1)[-1]


def children(element, name):
    return [child for child in element if tag(child) == name]


def name_of(element):
    names = children(element, "name")
    return {"name": names[0].text.strip()} if names and names[0].text and names[0].text.strip() else {}


def parse_xml(path, kind):
    # Decode first so declaration checks also cover UTF-16 exports.
    raw = path.read_bytes()
    encoding = "utf-16" if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    text = raw.decode(encoding)
    require(not re.search(r"<!\s*(DOCTYPE|ENTITY)\b", text, re.I), "XML DTD/entity declarations are unsupported.")
    root = ET.fromstring(text)
    segments = []
    if kind == "gpx":
        require(tag(root) == "gpx", "Expected a GPX document.")
        for item in root:
            if tag(item) == "trk":
                for segment in children(item, "trkseg"):
                    points = children(segment, "trkpt")
                    segments.append(([coordinate([p.attrib["lon"], p.attrib["lat"]], text=True) for p in points], name_of(item)))
            elif tag(item) == "rte":
                points = children(item, "rtept")
                segments.append(([coordinate([p.attrib["lon"], p.attrib["lat"]], text=True) for p in points], name_of(item)))
    else:
        require(tag(root) == "kml", "Expected a KML document; KMZ is unsupported.")
        for placemark in (item for item in root.iter() if tag(item) == "Placemark"):
            for geometry in placemark.iter():
                if tag(geometry) == "LineString":
                    lists = children(geometry, "coordinates")
                    require(len(lists) == 1 and lists[0].text, "KML LineString needs coordinates.")
                    segments.append(([coordinate(token.split(","), text=True) for token in lists[0].text.split()], name_of(placemark)))
                elif geometry.tag == "{http://www.google.com/kml/ext/2.2}Track":
                    points = children(geometry, "coord")
                    segments.append(([coordinate((point.text or "").split(), text=True) for point in points], name_of(placemark)))
    return segments


def parse_geojson(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    segments = []

    def visit(value, properties=None):
        require(isinstance(value, dict), "GeoJSON objects must be objects.")
        require("crs" not in value, "Projected/legacy CRS is unsupported; convert to WGS84 longitude/latitude first.")
        kind = value.get("type")
        if kind == "FeatureCollection":
            require(isinstance(value.get("features"), list), "FeatureCollection needs a features array.")
            for feature in value["features"]:
                require(isinstance(feature, dict) and feature.get("type") == "Feature", "FeatureCollection contains a non-feature.")
                visit(feature)
        elif kind == "Feature":
            props = value.get("properties")
            if props is None:
                props = {}
            require(isinstance(props, dict), "Feature properties must be an object or null.")
            visit(value.get("geometry"), props)
        elif kind == "GeometryCollection":
            require(isinstance(value.get("geometries"), list), "GeometryCollection needs geometries.")
            for geometry in value["geometries"]:
                visit(geometry, properties)
        elif kind in ("LineString", "MultiLineString"):
            coords = value.get("coordinates")
            require(isinstance(coords, list), "Line geometry needs a coordinates array.")
            lines = [coords] if kind == "LineString" else coords
            require(len(lines) > 0, "MultiLineString is empty.")
            for line in lines:
                require(isinstance(line, list), "Line coordinates must be an array.")
                segments.append(([coordinate(point) for point in line], properties or {}))
        elif kind in ("Point", "MultiPoint"):
            pass  # Waypoints do not define a journey path.
        else:
            raise ImportErrorMessage(f"Unsupported GeoJSON geometry: {kind}.")

    visit(data)
    return segments


def split_dateline(points):
    require(len(points) >= 2, "Every track segment must have at least two positions; none are silently discarded.")
    require(any(point != points[0] for point in points[1:]), "Track segment contains only one distinct position.")
    parts, current = [], [points[0]]
    for end in points[1:]:
        start = current[-1]
        delta = end[0] - start[0]
        # +180 and -180 denote the same meridian, including vertical seam paths.
        if abs(delta) == 360:
            end = [start[0], end[1]]
            delta = 0
        if abs(delta) > 180:
            unwrapped = end[0] - math.copysign(360, delta)
            boundary = 180 if unwrapped > start[0] else -180
            fraction = (boundary - start[0]) / (unwrapped - start[0])
            latitude = start[1] + fraction * (end[1] - start[1])
            crossing = [boundary, latitude]
            if current[-1] != crossing:
                current.append(crossing)
            if len(current) >= 2:
                parts.append(current)
            current = [[-boundary, latitude]]
        if current[-1] != end:
            current.append(end)
    if len(current) >= 2:
        parts.append(current)
    require(parts, "Segment has no drawable line after antimeridian normalization.")
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--format", choices=("gpx", "kml", "geojson"), help="Override input extension")
    parser.add_argument("--mode", required=True, choices=("road", "rail", "water"))
    parser.add_argument("--id", required=True, help="Stable ID prefix; each segment receives a numeric suffix")
    parser.add_argument("--output", required=True, type=Path, help="New GeoJSON file; existing files are refused")
    parser.add_argument("--demo", action="store_true", help="Mark illustrative/sample data; default is demo=false")
    for field in ("name", "from", "to", "date", "source"):
        parser.add_argument(f"--{field}", dest=field, help=f"Override {field} metadata for all output segments")
    args = parser.parse_args()
    try:
        require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", args.id), "ID prefix must contain letters, digits, underscores, or hyphens.")
        require(not args.output.exists(), "Output already exists; choose a new file for review.")
        kind = args.format or {".gpx": "gpx", ".kml": "kml", ".geojson": "geojson", ".json": "geojson"}.get(args.input.suffix.lower())
        require(kind, "Unknown input extension; specify --format gpx, kml, or geojson.")
        segments = parse_geojson(args.input) if kind == "geojson" else parse_xml(args.input, kind)
        require(segments, "No supported route geometry found. Waypoints alone cannot define a route.")
        features = []
        for points, original in segments:
            props = {}
            for key in ("name", "from", "to", "date", "source"):
                value = vars(args)[key] if vars(args)[key] is not None else original.get(key)
                require(value is None or isinstance(value, str), f"Optional {key} metadata must be text.")
                if value is not None:
                    props[key] = value
            props.setdefault("source", f"Imported {kind.upper()} · {args.input.name}")
            parts = split_dateline(points)
            for part in parts:
                properties = {**props, "id": f"{args.id}-{len(features) + 1:03d}", "mode": args.mode,
                    "geometryNote": "Imported source segment; no routing or map matching applied."}
                if len(parts) > 1:
                    properties["geometryNote"] += " Split at the antimeridian by linear interpolation."
                features.append({"type": "Feature", "properties": properties,
                    "geometry": {"type": "LineString", "coordinates": part}})
        data = {"type": "FeatureCollection", "demo": args.demo, "features": features}
        encoded = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as handle:
            try:
                handle.write(encoded)
            except OSError:
                handle.close()
                args.output.unlink(missing_ok=True)
                raise
        print(f"Imported {len(segments)} source segments into {len(features)} {args.mode} features: {args.output}")
        return 0
    except (ImportErrorMessage, OSError, ValueError, KeyError, TypeError, ET.ParseError) as error:
        print(f"Route import failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
