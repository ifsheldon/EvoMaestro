"use client";

import i18next from "i18next";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type AppLocale,
  DEFAULT_APP_LOCALE,
  otherAppLocale,
  readStoredAppLocale,
  writeStoredAppLocale,
} from "./config";
import { resources } from "./resources";

const i18n = i18next.createInstance();
void i18n.init({
  resources,
  lng: DEFAULT_APP_LOCALE,
  fallbackLng: DEFAULT_APP_LOCALE,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

const PATCH_TYPE_TRANSLATION_KEYS: Record<string, string> = {
  cross: "patchType.cross",
  diff: "patchType.diff",
  full: "patchType.full",
  init: "patchType.init",
  mutation: "patchType.mutation",
  start: "patchType.start",
};

export function translatePatchType(t: Translate, patchType: string): string {
  const key = PATCH_TYPE_TRANSLATION_KEYS[patchType];
  return key ? t(key) : patchType;
}

/** Translation helper for imperative renderers that cannot use React hooks. */
export const translateUi: Translate = (key, options) =>
  String(i18n.t(key, options ?? {}));

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  toggleLocale: () => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_APP_LOCALE);

  const applyLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    void i18n.changeLanguage(nextLocale);
    if (typeof window !== "undefined") {
      writeStoredAppLocale(window.localStorage, nextLocale);
      document.documentElement.lang = nextLocale;
    }
  }, []);

  useEffect(() => {
    const storedLocale = readStoredAppLocale(window.localStorage);
    applyLocale(storedLocale ?? DEFAULT_APP_LOCALE);
  }, [applyLocale]);

  const toggleLocale = useCallback(() => {
    applyLocale(otherAppLocale(locale));
  }, [applyLocale, locale]);

  const t = translateUi;

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale: applyLocale, toggleLocale, t }),
    [applyLocale, locale, toggleLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
