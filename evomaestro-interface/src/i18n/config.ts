export type AppLocale = "en" | "zh-CN";

export const DEFAULT_APP_LOCALE: AppLocale = "en";
export const APP_LOCALE_STORAGE_KEY = "evomaestro-ui-language";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function parseAppLocale(value: string | null): AppLocale | null {
  if (value === "en") return "en";
  if (value === "zh" || value === "zh-CN") return "zh-CN";
  return null;
}

export function readStoredAppLocale(
  storage: ReadableStorage,
): AppLocale | null {
  try {
    return parseAppLocale(storage.getItem(APP_LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredAppLocale(
  storage: WritableStorage,
  locale: AppLocale,
): boolean {
  try {
    storage.setItem(APP_LOCALE_STORAGE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

export function otherAppLocale(locale: AppLocale): AppLocale {
  return locale === "en" ? "zh-CN" : "en";
}
