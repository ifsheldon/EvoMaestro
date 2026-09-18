import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  APP_LOCALE_STORAGE_KEY,
  otherAppLocale,
  parseAppLocale,
  readStoredAppLocale,
  writeStoredAppLocale,
} from "./config";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("application locale", () => {
  test("normalizes supported persisted locale values", () => {
    assert.equal(parseAppLocale("en"), "en");
    assert.equal(parseAppLocale("zh"), "zh-CN");
    assert.equal(parseAppLocale("zh-CN"), "zh-CN");
    assert.equal(parseAppLocale("fr"), null);
  });

  test("persists and reads the selected locale", () => {
    const storage = createMemoryStorage();
    assert.equal(writeStoredAppLocale(storage, "zh-CN"), true);
    assert.equal(storage.getItem(APP_LOCALE_STORAGE_KEY), "zh-CN");
    assert.equal(readStoredAppLocale(storage), "zh-CN");
  });

  test("toggles between the two supported locales", () => {
    assert.equal(otherAppLocale("en"), "zh-CN");
    assert.equal(otherAppLocale("zh-CN"), "en");
  });

  test("handles unavailable storage without crashing", () => {
    const storage = {
      getItem() {
        throw new Error("unavailable");
      },
      setItem() {
        throw new Error("unavailable");
      },
    };
    assert.equal(readStoredAppLocale(storage), null);
    assert.equal(writeStoredAppLocale(storage, "en"), false);
  });
});
