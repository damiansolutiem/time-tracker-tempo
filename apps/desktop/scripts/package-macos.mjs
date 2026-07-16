import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const flavor = process.argv[2];
if (flavor !== 'production' && flavor !== 'development') {
  throw new Error('Expected packaging flavor: production or development.');
}

const productName = flavor === 'development' ? 'Tempo Dev' : 'Tempo';
const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../src-tauri/tauri.conf.json'), 'utf8'),
);
const configArguments =
  flavor === 'development' ? ['--config', 'src-tauri/tauri.dev.conf.json'] : [];
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'tauri',
    'build',
    '--target',
    'aarch64-apple-darwin',
    '--bundles',
    'app,dmg',
    ...configArguments,
  ],
  {
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      VITE_APP_FLAVOR: flavor,
      TEMPO_BUILD_FLAVOR: flavor,
    },
    stdio: 'inherit',
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const bundleRoot = resolve(
  import.meta.dirname,
  '../src-tauri/target/aarch64-apple-darwin/release/bundle',
);
const destination = resolve(import.meta.dirname, `../release-artifacts/${flavor}`);
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(
  resolve(bundleRoot, `macos/${productName}.app`),
  resolve(destination, `${productName}.app`),
  {
    recursive: true,
  },
);
cpSync(
  resolve(bundleRoot, `dmg/${productName}_${version}_aarch64.dmg`),
  resolve(destination, `${productName}_${version}_aarch64.dmg`),
);

console.log(`Archived ${flavor} artifacts in ${destination}`);
