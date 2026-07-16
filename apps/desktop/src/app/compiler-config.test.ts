import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('React Compiler configuration', () => {
  it('remains active in the Vite React transform', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(config).toContain("'babel-plugin-react-compiler'");
    expect(config).toMatch(/react\(\{[\s\S]*babel:[\s\S]*plugins:/);
  });
});
