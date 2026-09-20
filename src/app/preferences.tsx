import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { localRepository } from "../db/repositories";
import { DEFAULT_TUNING_A4_HZ } from "../domain/tuning";
import { getMessages, type Locale } from "./i18n";

export type Theme = "dark" | "light";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface PreferenceContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  tuningA4Hz: number;
  setTuningA4Hz: (value: number) => void;
  storageNotice: "failed" | "invalid" | null;
}

const THEME_STORAGE_KEY = "pitchy.ui.theme";
const LOCALE_STORAGE_KEY = "pitchy.ui.locale";
const PreferenceContext = createContext<PreferenceContextValue | null>(null);

function safelyRead(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safelyWrite(storage: StorageLike | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // UI preferences are best-effort when storage is unavailable or blocked.
  }
}

function getBrowserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function resolveInitialTheme(storage: StorageLike | null, prefersDark: boolean): Theme {
  const storedTheme = safelyRead(storage, THEME_STORAGE_KEY);
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }
  return prefersDark ? "dark" : "light";
}

export function resolveInitialLocale(
  storage: StorageLike | null,
  browserLanguages: readonly string[],
): Locale {
  const storedLocale = safelyRead(storage, LOCALE_STORAGE_KEY);
  if (storedLocale === "zh-CN" || storedLocale === "en") {
    return storedLocale;
  }

  for (const language of browserLanguages) {
    const normalizedLanguage = language.toLowerCase();
    if (normalizedLanguage.startsWith("zh")) {
      return "zh-CN";
    }
    if (normalizedLanguage.startsWith("en")) {
      return "en";
    }
  }

  return "zh-CN";
}

export function PreferenceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [storageNotice, setStorageNotice] = useState<"failed" | "invalid" | null>(null);
  const [tuningA4Hz, setTuningA4Hz] = useState(DEFAULT_TUNING_A4_HZ);
  const [theme, setTheme] = useState<Theme>(() =>
    resolveInitialTheme(
      getBrowserStorage(),
      typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches,
    ),
  );
  const [locale, setLocale] = useState<Locale>(() =>
    resolveInitialLocale(getBrowserStorage(), window.navigator.languages),
  );
  const [initialPreferences] = useState(() => ({ theme, locale, tuningA4Hz }));

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Settings load timed out")), 3000);
    });
    void Promise.race([localRepository.loadPreferences(initialPreferences), timeout])
      .then(({ preferences, invalid }) => {
        if (!active) return;
        setTheme(preferences.theme);
        setLocale(preferences.locale);
        setTuningA4Hz(preferences.tuningA4Hz);
        setStorageNotice(invalid ? "invalid" : null);
      })
      .catch(() => {
        if (active) setStorageNotice("failed");
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (active) setReady(true);
      });
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [initialPreferences]);

  useEffect(() => {
    if (!ready || revision === 0) return;
    let active = true;
    void localRepository
      .savePreferences({ theme, locale, tuningA4Hz })
      .then(() => {
        if (active) setStorageNotice(null);
      })
      .catch(() => {
        if (active) setStorageNotice("failed");
      });
    return () => {
      active = false;
    };
  }, [ready, revision, theme, locale, tuningA4Hz]);

  useEffect(() => {
    const root = document.documentElement;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = root.dataset.theme;
    const previousColorScheme = root.style.colorScheme;
    const previousThemeColor = themeColor?.content;

    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    themeColor?.setAttribute("content", theme === "dark" ? "#08111f" : "#f3f7fb");
    safelyWrite(getBrowserStorage(), THEME_STORAGE_KEY, theme);

    return () => {
      if (previousTheme) {
        root.dataset.theme = previousTheme;
      } else {
        delete root.dataset.theme;
      }
      root.style.colorScheme = previousColorScheme;
      if (previousThemeColor) {
        themeColor?.setAttribute("content", previousThemeColor);
      }
    };
  }, [theme]);

  useEffect(() => {
    const messages = getMessages(locale);
    const root = document.documentElement;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousLocale = root.lang;
    const previousTitle = document.title;
    const previousDescription = description?.content;

    root.lang = locale;
    document.title = messages.documentTitle;
    description?.setAttribute("content", messages.documentDescription);
    safelyWrite(getBrowserStorage(), LOCALE_STORAGE_KEY, locale);

    return () => {
      root.lang = previousLocale;
      document.title = previousTitle;
      if (previousDescription) {
        description?.setAttribute("content", previousDescription);
      }
    };
  }, [locale]);

  return (
    <PreferenceContext.Provider
      value={{
        locale,
        theme,
        tuningA4Hz,
        storageNotice,
        setLocale: (value) => {
          setLocale(value);
          setRevision((v) => v + 1);
        },
        setTheme: (value) => {
          setTheme(value);
          setRevision((v) => v + 1);
        },
        setTuningA4Hz: (value) => {
          setTuningA4Hz(value);
          setRevision((v) => v + 1);
        },
      }}
    >
      {ready ? children : <p role="status">{getMessages(locale).loadingPreferences}</p>}
    </PreferenceContext.Provider>
  );
}

export function usePreferences(): PreferenceContextValue {
  const preferences = useContext(PreferenceContext);
  if (!preferences) {
    throw new Error("usePreferences must be used inside PreferenceProvider");
  }
  return preferences;
}
