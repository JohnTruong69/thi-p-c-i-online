import { useEffect, useState } from 'react';

/** Browser-tab-only demo data. Nothing is sent to a server. */
export function useDemoSession<T>(key: string, initial: T, valid: (value: unknown) => value is T): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem(`phase1:${key}`);
        if (!raw) { setValue(initial); return; }
        const parsed: unknown = JSON.parse(raw);
        if (valid(parsed)) setValue(parsed);
      } catch { /* Storage may be unavailable; this remains an in-memory demo. */ }
    };
    read();
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) read();
    };
    window.addEventListener('phase1-demo-change', onChange);
    return () => window.removeEventListener('phase1-demo-change', onChange);
  }, [key]);
  const update = (next: T | ((previous: T) => T)) => {
    // Resolve from the latest tab value before setting state: React may replay
    // state updater callbacks, so writes and events must not happen inside one.
    let previous = value;
    try {
      const raw = sessionStorage.getItem(`phase1:${key}`);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (valid(parsed)) previous = parsed;
      }
    } catch { /* Keep the in-memory value when storage is unavailable. */ }
    const result = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
    setValue(result);
    try {
      sessionStorage.setItem(`phase1:${key}`, JSON.stringify(result));
      window.dispatchEvent(new CustomEvent('phase1-demo-change', { detail: key }));
    } catch { /* No persistence in private/blocked storage. */ }
  };
  return [value, update];
}

export function resetDemoSession() {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('phase1:') || key.startsWith('rsvp-demo:')) sessionStorage.removeItem(key);
    window.dispatchEvent(new CustomEvent('phase1-demo-reset'));
  } catch { /* Browser storage unavailable. */ }
}