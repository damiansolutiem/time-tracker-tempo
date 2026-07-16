import { describe, expect, it } from 'vitest';
import { createTrayIconRgba } from './trayIcon';

describe('tray icon', () => {
  it('creates a transparent monochrome RGBA clock glyph', () => {
    const icon = createTrayIconRgba(32);
    const alpha = icon.filter((_, index) => index % 4 === 3);
    expect(icon).toHaveLength(32 * 32 * 4);
    expect(alpha[0]).toBe(0);
    expect(Math.max(...alpha)).toBe(255);
    expect(alpha.filter((value) => value > 0).length).toBeGreaterThan(100);
  });
});
