import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type TauriConfig = {
  productName: string;
  identifier: string;
  bundle: { targets: string[] };
};

type DevelopmentConfig = {
  productName: string;
  identifier: string;
  app: { windows: Array<{ title: string }> };
  bundle: { icon: string[] };
};

describe('macOS packaging defaults', () => {
  it('keeps the current product identity centralized in Tauri configuration', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as TauriConfig;

    expect(config.productName).toBe('Tempo');
    expect(config.identifier).toBe('dev.damian.tempo');
    expect(config.bundle.targets).toEqual(['app', 'dmg']);
  });

  it('uses an explicit Apple Silicon target for the current release package', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts['package:macos:production']).toBe(
      'node scripts/package-macos.mjs production',
    );
    expect(packageJson.scripts['package:macos:development']).toBe(
      'node scripts/package-macos.mjs development',
    );
    const packagingScript = readFileSync(
      resolve(process.cwd(), 'scripts/package-macos.mjs'),
      'utf8',
    );
    expect(packagingScript).toContain("'aarch64-apple-darwin'");
    expect(packagingScript).toContain("'app,dmg'");
    expect(packagingScript).toContain('release-artifacts/${flavor}');
  });

  it('gives the installable development flavor a distinct identity and icon bundle', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.dev.conf.json'), 'utf8'),
    ) as DevelopmentConfig;

    expect(config.productName).toBe('Tempo Dev');
    expect(config.identifier).toBe('dev.damian.tempo.dev');
    expect(config.app.windows[0]?.title).toBe('Tempo Dev');
    expect(config.bundle.icon).toContain('icons-dev/icon.icns');
    expect(config.bundle.icon).not.toContain('icons/icon.icns');
  });
});
