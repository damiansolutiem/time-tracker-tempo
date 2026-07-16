// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalDialog } from './useModalDialog';

function TestDialog({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useModalDialog<HTMLDivElement>(onClose, busy);
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button type="button">First</button>
      <button type="button" onClick={() => setBusy((value) => !value)}>
        Last
      </button>
    </div>
  );
}

describe('useModalDialog', () => {
  let container: HTMLDivElement;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
    trigger = document.createElement('button');
    container = document.createElement('div');
    document.body.append(trigger, container);
    trigger.focus();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('traps Tab focus, respects busy Escape state, and restores prior focus once', () => {
    const onClose = vi.fn();
    const root = createRoot(container);
    act(() => root.render(<TestDialog onClose={onClose} />));
    const [first, last] = [...container.querySelectorAll('button')];
    expect(document.activeElement).toBe(first);

    last!.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    act(() => last!.click());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(trigger);

    act(() => last!.click());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();

    act(() => root.unmount());
    expect(document.activeElement).toBe(trigger);
  });
});
