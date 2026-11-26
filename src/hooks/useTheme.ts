import {useCallback, useEffect, useState} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'zercauto_theme';
const THEME_EVENT = 'zercauto-theme-change';

function getStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

export function applyThemeToDocument(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.dataset.theme = resolved;

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', resolved === 'dark' ? '#070B13' : '#1E293B');
    }
  }
  return resolved;
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredPreference())
  );

  const syncFromPreference = useCallback((nextPref: ThemePreference) => {
    setPreferenceState(nextPref);
    const resolved = applyThemeToDocument(nextPref);
    setResolvedTheme(resolved);
  }, []);

  const setPreference = useCallback(
    (nextPref: ThemePreference) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, nextPref);
      } catch {
        // Ignore storage write errors
      }
      syncFromPreference(nextPref);
      window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_EVENT, {detail: nextPref}));
    },
    [syncFromPreference]
  );

  const toggleTheme = useCallback(() => {
    const currentResolved = resolveTheme(getStoredPreference());
    setPreference(currentResolved === 'dark' ? 'light' : 'dark');
  }, [setPreference]);

  useEffect(() => {
    applyThemeToDocument(preference);
  }, [preference]);

  useEffect(() => {
    const handleCustomEvent = (event: Event) => {
      const custom = event as CustomEvent<ThemePreference>;
      if (custom.detail) {
        syncFromPreference(custom.detail);
      } else {
        syncFromPreference(getStoredPreference());
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        syncFromPreference(getStoredPreference());
      }
    };

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const handleMediaChange = () => {
      if (getStoredPreference() === 'system') {
        syncFromPreference('system');
      }
    };

    window.addEventListener(THEME_EVENT, handleCustomEvent);
    window.addEventListener('storage', handleStorage);
    mediaQuery?.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener(THEME_EVENT, handleCustomEvent);
      window.removeEventListener('storage', handleStorage);
      mediaQuery?.removeEventListener('change', handleMediaChange);
    };
  }, [syncFromPreference]);

  return {
    preference,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    setPreference,
    toggleTheme,
  };
}
