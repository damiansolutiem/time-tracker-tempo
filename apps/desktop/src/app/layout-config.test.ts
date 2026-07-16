import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('desktop scroll ownership', () => {
  it('keeps the document fixed so the shell panes are the only page scroll owners', () => {
    const css = source('src/theme/tokens.css');
    const app = source('src/app/App.tsx');

    expect(css).toMatch(/html\s*{[^}]*height: 100%;[^}]*overflow: hidden;/s);
    expect(css).toMatch(/body\s*{[^}]*height: 100%;[^}]*overflow: hidden;/s);
    expect(css).toMatch(/#root\s*{[^}]*height: 100%;[^}]*overflow: hidden;/s);
    expect(app).toContain('flex h-full min-h-0 overflow-hidden');
    expect(app).toContain('h-full min-h-0 min-w-0 flex-1 overflow-y-auto');
  });

  it('bounds every standard dialog and gives overflowing content one contained scrollbar', () => {
    const dialogFiles = [
      'src/features/groups/GroupDialog.tsx',
      'src/features/history/EntryDialog.tsx',
      'src/features/tasks/TaskDialog.tsx',
      'src/features/tasks/TaskImportDialog.tsx',
      'src/features/workday/ClassificationDialog.tsx',
      'src/features/reports/ReportsPage.tsx',
      'src/features/timer/TimerPage.tsx',
    ];

    for (const file of dialogFiles) {
      const contents = source(file);
      expect(contents, file).toContain('max-h-[');
      expect(contents, file).toContain('calc(100vh-3rem)');
      expect(contents, file).toContain('overflow-y-auto');
      expect(contents, file).toContain('overscroll-contain');
    }
  });
});
