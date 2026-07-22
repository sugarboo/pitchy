import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
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
    <PreferenceContext.Provider value={{ locale, setLocale, theme, setTheme }}>
      {children}
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
