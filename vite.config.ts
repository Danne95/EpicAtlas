import { defineConfig, type UserConfig } from 'vite';
import { resolve } from 'node:path';
import { travelStorage } from './server/travelStorage';
import { citySearch } from './server/citySearch';
import { airportLookup } from './server/airports';
import { groundRouting } from './server/groundRouting';
import { localMaps } from './server/localMaps';

// Checks use this same configuration with a disposable data directory.
export function createAtlasConfig(root = process.cwd()): UserConfig {
  return {
    root,
    base: './',
    publicDir: false,
    plugins: [
      localMaps(),
      travelStorage(resolve(root, 'private/travel/workspace.json')),
      citySearch(resolve(root, 'private/maps/cities')),
      airportLookup(resolve(root, 'private/maps/airports/catalogue.json')),
      groundRouting(resolve(root, 'private/maps/routes')),
    ],
    server: {
      host: '127.0.0.1',
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/private/**', '**/public/**', '**/tools/regions/**', '**/.verification/**'],
      },
    },
    preview: { host: '127.0.0.1' },
  };
}

export default defineConfig(createAtlasConfig());
