import { describe, expect, it } from 'vitest';
import { buildFlavor, isDevelopmentBuild, productName } from './buildFlavor';

describe('frontend build flavor', () => {
  it('defaults ordinary builds to production identity', () => {
    expect(buildFlavor).toBe('production');
    expect(isDevelopmentBuild).toBe(false);
    expect(productName).toBe('Tempo');
  });
});
