import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { resources } from "./resources";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") {
    assert.notEqual(
      value.trim(),
      "",
      `translation ${prefix} must not be empty`,
    );
    return [prefix];
  }
  assert.equal(
    typeof value,
    "object",
    `translation group ${prefix || "<root>"} must be an object`,
  );
  assert.notEqual(value, null, `translation group ${prefix} must not be null`);

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leafValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value as Record<string, unknown>).flatMap(leafValues);
}

describe("translation resources", () => {
  test("English and Simplified Chinese expose the same non-empty keys", () => {
    const englishKeys = leafKeys(resources.en.translation).sort();
    const chineseKeys = leafKeys(resources["zh-CN"].translation).sort();

    assert.deepEqual(chineseKeys, englishKeys);
  });

  test("does not expose legacy post-evaluation novelty labels", () => {
    const visibleText = leafValues(resources).join("\n");

    assert.doesNotMatch(visibleText, /\bNovelty\b/);
    assert.doesNotMatch(visibleText, /新颖性/);
  });
});
