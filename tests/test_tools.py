"""Offline tool checks using disposable synthetic inputs only."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('cleanup', ROOT / 'tools/cleanup-regions.py')
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class ToolChecks(unittest.TestCase):
    def setUp(self):
        directory = ROOT / '.verification'
        directory.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='tools-check-', dir=directory)
        self.root = Path(self.temporary.name)

    def tearDown(self):
        self.assertTrue(self.root.resolve().is_relative_to((ROOT / '.verification').resolve()))
        self.temporary.cleanup()

    def test_import_modes_segments_and_existing_output(self):
        source = self.root / 'synthetic.geojson'
        source.write_text(json.dumps({'type': 'MultiLineString', 'coordinates': [
            [[179, 1], [-179, 2]], [[10, 1], [11, 2]],
        ]}), encoding='utf-8')
        for mode in ('road', 'rail', 'water'):
            output = self.root / f'{mode}.geojson'
            command = [sys.executable, str(ROOT / 'tools/import-route.py'), str(source), '--mode', mode, '--id', 'synthetic', '--output', str(output)]
            subprocess.run(command, check=True, capture_output=True)
            data = json.loads(output.read_text(encoding='utf-8'))
            self.assertFalse(data['demo'])
            self.assertEqual(len(data['features']), 3)
            self.assertTrue(all(feature['properties']['mode'] == mode for feature in data['features']))
            before = output.read_bytes()
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(output.read_bytes(), before)

    def test_cleanup_retains_water_and_world_and_rejects_stale_plan(self):
        regions = self.root / 'maps/regions'
        regions.mkdir(parents=True)
        world = self.root / 'maps/world'
        world.mkdir()
        (world / 'sentinel.txt').write_text('synthetic world', encoding='utf-8')
        packs = []
        for name, bounds in [('keep', [0, 0, 3, 3]), ('unused', [20, 20, 21, 21])]:
            header = bytearray(127)
            header[:8] = b'PMTiles\x03'
            header[99:102] = bytes([1, 0, 1])
            struct.pack_into('<4i', header, 102, *(round(v * 1e7) for v in bounds))
            (regions / f'{name}.pmtiles').write_bytes(header)
            packs.append({'id': name, 'file': f'{name}.pmtiles', 'bounds': bounds, 'minZoom': 0, 'maxZoom': 1,
                          'sizeBytes': len(header), 'sha256': hashlib.sha256(header).hexdigest(), 'travelReferences': []})
        (regions / 'manifest.json').write_text(json.dumps({'version': 1, 'packs': packs}), encoding='utf-8')
        workspace = {'version': 1, **{group: {'type': 'FeatureCollection', 'demo': False, 'features': []}
                                    for group in ('locations', 'roads', 'rail', 'water')}, 'flights': {'demo': False, 'flights': []}}
        workspace['water']['features'].append({'type': 'Feature', 'properties': {'id': 'synthetic-water', 'mode': 'water'},
                                               'geometry': {'type': 'LineString', 'coordinates': [[1, 1], [2, 2]]}})
        source = self.root / 'workspace.json'
        source.write_text(json.dumps(workspace), encoding='utf-8')
        plan, _ = cleanup.make_plan(source, regions)
        self.assertFalse(plan['packs'][0]['unused'])
        self.assertTrue(plan['packs'][1]['unused'])
        source.write_text(json.dumps(workspace) + '\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'stale'):
            cleanup.apply_plan(plan, source, regions)
        fresh, _ = cleanup.make_plan(source, regions)
        cleanup.apply_plan(fresh, source, regions)
        self.assertTrue((regions / 'keep.pmtiles').exists())
        self.assertFalse((regions / 'unused.pmtiles').exists())
        self.assertEqual((world / 'sentinel.txt').read_text(encoding='utf-8'), 'synthetic world')


if __name__ == '__main__':
    unittest.main()
