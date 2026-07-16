import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Csp = Record<string, string>;
type TauriConfig = { app: { security: { csp: Csp; devCsp: Csp } } };

function securityConfig() {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
  ) as TauriConfig;
  return config.app.security;
}

describe('Tauri content security policy', () => {
  it('keeps production local-only and permits only the native IPC bridge', () => {
    const { csp } = securityConfig();
    const policy = Object.values(csp).join(' ');

    expect(csp['default-src']).toBe("'self'");
    expect(csp['connect-src']).toBe('ipc: http://ipc.localhost');
    expect(csp['object-src']).toBe("'none'");
    expect(csp['frame-src']).toBe("'none'");
    expect(policy).not.toContain('localhost:1420');
    expect(policy).not.toContain('ws:');
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it('limits development exceptions to the Vite server and HMR socket', () => {
    const { devCsp } = securityConfig();

    expect(devCsp['connect-src']).toContain('ws://localhost:1420');
    expect(devCsp['script-src']).toContain('http://localhost:1420');
    expect(devCsp['script-src']).toContain("'unsafe-inline'");
    expect(devCsp['script-src']).not.toContain("'unsafe-eval'");
    expect(devCsp['object-src']).toBe("'none'");
    expect(devCsp['frame-src']).toBe("'none'");
  });
});
