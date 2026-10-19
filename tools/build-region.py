#!/usr/bin/env python3
"""Prepare a local regional PMTiles bundle. Python 3.10+, standard library only."""
import argparse
from datetime import date
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile


class PreparationError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise PreparationError(message)


def read_json(path):
    with path.open(encoding="utf-8-sig") as handle:
        return json.load(handle)


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


def run(cli, *arguments, as_json=False):
    result = subprocess.run([cli, *map(str, arguments)], capture_output=True, text=True,
                            encoding="utf-8", errors="replace", check=False)
    require(result.returncode == 0, f"pmtiles {arguments[0]} failed:\n{result.stderr.strip() or result.stdout.strip()}")
    return json.loads(result.stdout) if as_json else result.stdout.strip()


def archive_info(cli, path):
    with path.open("rb") as handle:
        raw = handle.read(127)
    require(len(raw) == 127 and raw[:8] == b"PMTiles\x03", "Expected a PMTiles version 3 archive.")
    require(raw[96] == 1, "Source/output archive must be clustered for extraction.")
    count = struct.unpack_from("<Q", raw, 72)[0]
    require(count > 0, "Archive contains no addressed tiles.")
    header = run(cli, "show", path, "--header-json", as_json=True)
    metadata = run(cli, "show", path, "--metadata", as_json=True)
    require(header.get("tile_type") == "mvt", "Only MVT vector archives are supported.")
    require(isinstance(metadata.get("version"), str) and metadata["version"].startswith("4."),
            "Expected Protomaps v4 metadata; other profiles need a compatible app style.")
    layers = {layer.get("id") for layer in metadata.get("vector_layers", [])}
    require({"buildings", "landuse", "places", "roads", "water"} <= layers,
            "Archive is missing layers required by the protomaps-v4 style.")
    return header, metadata, count


def validate_recipe(recipe):
    require(isinstance(recipe, dict) and recipe.get("version") == 1, "Expected recipe version 1.")
    for key in ("id", "name", "source", "sourceVersion", "attribution", "license", "licenseUrl"):
        require(isinstance(recipe.get(key), str) and recipe[key].strip(), f"Missing nonempty {key}.")
    identifier = recipe["id"]
    require(re.fullmatch(r"[a-z0-9-]+", identifier) is not None, "ID must contain lowercase letters, digits, or hyphens.")
    require(identifier.upper() not in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}, "ID is a reserved Windows filename.")
    require(recipe.get("profile") == "protomaps-v4", "Only profile protomaps-v4 is supported.")
    require(isinstance(recipe.get("sourceSha256"), str) and re.fullmatch(r"[a-fA-F0-9]{64}", recipe["sourceSha256"]), "Provide the expected sourceSha256.")
    bounds = recipe.get("bounds")
    require(isinstance(bounds, list) and len(bounds) == 4 and all(type(v) in (int, float) and math.isfinite(v) for v in bounds), "Bounds must be four finite numbers.")
    w, s, e, n = bounds
    require(-180 <= w < e <= 180 and -85.051129 <= s < n <= 85.051129, "Bounds must be ordered and within Mercator coverage; split antimeridian regions.")
    lo, hi = recipe.get("minZoom"), recipe.get("maxZoom")
    require(type(lo) is int and type(hi) is int and 0 <= lo <= hi <= 22, "Zooms must be integers with 0 <= minZoom <= maxZoom <= 22.")
    refs = recipe.get("travelReferences")
    require(isinstance(refs, list) and all(isinstance(v, str) and v.strip() for v in refs) and len(set(refs)) == len(refs), "travelReferences must contain unique nonempty record IDs.")
    require(type(recipe.get("maxBytes")) is int and recipe["maxBytes"] > 0, "Provide a positive integer maxBytes budget.")
    if "preparedDate" in recipe:
        date.fromisoformat(recipe["preparedDate"])


def build(args):
    recipe_path = args.recipe.resolve(strict=True)
    recipe = read_json(recipe_path)
    validate_recipe(recipe)
    source_value = args.source or recipe.get("sourceFile")
    require(source_value is not None, "Supply --source or sourceFile in the recipe.")
    require("://" not in str(source_value), "Use an already downloaded local source archive.")
    source = Path(source_value)
    if not source.is_absolute():
        source = (Path.cwd() if args.source else recipe_path.parent) / source
    source = source.resolve(strict=True)
    require(source.is_file(), "Source must be a local file.")
    cli = shutil.which(args.pmtiles) or (str(Path(args.pmtiles).resolve()) if Path(args.pmtiles).is_file() else None)
    require(cli is not None, "PMTiles CLI not found. Install go-pmtiles or pass --pmtiles PATH.")
    output = args.output_dir.resolve()
    require("world" not in {part.lower() for part in output.parts}, "Regional output must not be inside a world map directory.")
    identifier = recipe["id"]
    names = [f"{identifier}.pmtiles", f"{identifier}-LICENSE.txt", f"{identifier}-provenance.json"]
    require(source != output / names[0], "Source and output archive must be different files.")
    output.mkdir(parents=True, exist_ok=True)
    # Serialize preparation into the same destination; manifest is published last.
    lock = output / ".region-build.lock"
    try:
        lock_fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise PreparationError("Destination is locked by another build. If it was interrupted, remove .region-build.lock after checking no build is running.") from error
    os.close(lock_fd)
    try:
        manifest_path = output / "manifest.json"
        manifest = read_json(manifest_path) if manifest_path.exists() else {"version": 1, "packs": []}
        require(isinstance(manifest, dict) and manifest.get("version") == 1 and isinstance(manifest.get("packs"), list), "Destination manifest must use version 1.")
        require(all(isinstance(pack, dict) and isinstance(pack.get("id"), str) and isinstance(pack.get("file"), str) for pack in manifest["packs"]), "Destination manifest has malformed entries.")
        require(not any(pack["id"] == identifier or pack["file"] == names[0] for pack in manifest["packs"]), "Pack already exists in destination manifest. Build replacements in a fresh directory for review.")
        require(not any((output / name).exists() for name in names), "Output artifacts already exist; use a fresh destination or a new ID.")
        print("Checking local source checksum and profile...", flush=True)
        source_hash = digest(source)
        require(source_hash == recipe["sourceSha256"].lower(), "Source SHA-256 differs from recipe; no pack was installed.")
        source_header, metadata, _ = archive_info(cli, source)
        require(metadata["version"] == recipe["sourceVersion"], "Source metadata version differs from recipe.")
        require(source_header["minzoom"] <= recipe["minZoom"] <= recipe["maxZoom"] <= source_header["maxzoom"], "Requested zooms exceed source coverage.")
        w, s, e, n = recipe["bounds"]
        sw, ss, se, sn = source_header["bounds"]
        require(sw <= w and ss <= s and e <= se and n <= sn, "Requested bounds exceed source coverage.")
        cli_version = run(cli, "version")
        with tempfile.TemporaryDirectory(prefix=".region-stage-", dir=output) as temporary:
            stage = Path(temporary)
            archive = stage / names[0]
            bbox = ",".join(str(v) for v in recipe["bounds"])
            print(f"Extracting {identifier} locally...", flush=True)
            run(cli, "extract", source, archive, f"--bbox={bbox}", f"--minzoom={recipe['minZoom']}", f"--maxzoom={recipe['maxZoom']}")
            require(archive.stat().st_size <= recipe["maxBytes"], "Extracted archive exceeds maxBytes; no pack was installed.")
            run(cli, "verify", archive)
            header, _, tile_count = archive_info(cli, archive)
            require(header["minzoom"] == recipe["minZoom"] and header["maxzoom"] == recipe["maxZoom"], "Output zooms differ from recipe.")
            require(all(abs(a - b) <= 1e-7 for a, b in zip(header["bounds"], recipe["bounds"])), "Output bounds differ from recipe.")
            prepared = recipe.get("preparedDate", date.today().isoformat())
            pack = {key: recipe[key] for key in ("id", "name", "profile", "bounds", "minZoom", "maxZoom", "source", "sourceVersion", "attribution", "license", "travelReferences")}
            pack.update(file=names[0], sizeBytes=archive.stat().st_size, sha256=digest(archive), preparedDate=prepared)
            write_json(stage / names[2], {"version": 1, "recipe": recipe, "sourceFile": source.name,
                "sourceSha256": source_hash, "pmtilesCli": cli_version, "addressedTiles": tile_count,
                "output": pack, "header": header, "verification": "pmtiles verify + header/profile + SHA-256"})
            (stage / names[1]).write_text(
                f"{pack['name']} regional PMTiles, prepared {prepared}.\n"
                f"Source: {pack['source']}\nSource schema version: {pack['sourceVersion']}\n"
                f"Attribution: {pack['attribution']}\nLicense: {pack['license']}\nTerms: {recipe['licenseUrl']}\n"
                f"Changes: extracted intersecting tiles for bounds {bbox}, zooms {pack['minZoom']}–{pack['maxZoom']}.\n"
                "Tile contents are retained; the application supplies its own style.\n"
                f"Prepared using {cli_version}.\n", encoding="utf-8")
            manifest["packs"].append(pack)
            write_json(stage / "manifest.json", manifest)
            published = []
            try:
                for name in names:
                    os.replace(stage / name, output / name)
                    published.append(output / name)
                os.replace(stage / "manifest.json", manifest_path)
            except OSError:
                for path in published:
                    path.unlink(missing_ok=True)
                raise
        print(f"Prepared {identifier}: {pack['sizeBytes']:,} bytes, {tile_count} tiles\nManifest: {manifest_path}")
    finally:
        lock.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipe", type=Path, help="Version 1 JSON preparation recipe")
    parser.add_argument("--source", type=Path, help="Local input PMTiles; overrides recipe sourceFile")
    parser.add_argument("--pmtiles", default="pmtiles", help="go-pmtiles executable path (default: PATH)")
    parser.add_argument("--output-dir", required=True, type=Path, help="Regional bundle destination; existing IDs/files are never replaced")
    args = parser.parse_args()
    try:
        build(args)
    except (PreparationError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(f"Region preparation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
