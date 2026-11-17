'use client';
import { useSyncExternalStore } from 'react';
import type { EditionView } from '../schemas/edition';

const eventName = 'dayday-storage';
// Browser-only fallback for disabled/quota-limited localStorage. Never populated during SSR.
const fallback = new Map<string, string | null>();
let persistent = true;
export function readSetting(key: string) {
  if (typeof window === 'undefined') return null;
  if (fallback.has(key)) return fallback.get(key) || null;
  try { return window.localStorage.getItem(key); } catch { persistent = false; return null; }
}
export function writeSetting(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value);
    fallback.delete(key);
  } catch { fallback.set(key, value); persistent = false; }
  window.dispatchEvent(new Event(eventName));
}
function subscribe(notify: () => void) {
  window.addEventListener('storage', notify); window.addEventListener(eventName, notify);
  return () => { window.removeEventListener('storage', notify); window.removeEventListener(eventName, notify); };
}

export function useReadingProgress(issue: EditionView, scope: string) {
  const saved = useSyncExternalStore(subscribe, () => readSetting('dd-profile:' + scope), () => null);
  const profile = saved && ['reader-1', 'reader-2', 'reader-3'].includes(saved) ? saved : 'reader-1';
  const key = ['dd', scope, profile, issue.issueDate, issue.edition].join(':');
  const snapshot = useSyncExternalStore(subscribe, () => JSON.stringify(issue.articles
    .filter(a => readSetting(key + ':' + a.storyId) === 'read').map(a => a.storyId)), () => '[]');
  const read = JSON.parse(snapshot) as string[];
  const canPersist = useSyncExternalStore(subscribe, () => persistent, () => true);
  return {
    profile, read, canPersist,
    changeProfile: (profile: string) => writeSetting('dd-profile:' + scope, profile),
    toggle: (id: string) => {
      const item = key + ':' + id;
      writeSetting(item, readSetting(item) === 'read' ? null : 'read');
    },
    reset: () => issue.articles.forEach(a => writeSetting(key + ':' + a.storyId, null)),
  };
}
