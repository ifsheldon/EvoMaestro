import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS, parseSettings } from "./evolveSettings";

describe("persisted display preferences", () => {
  test("discards retired renderer choices while retaining current user preferences", () => {
    for (const treeViewMode of ["classic", "new", "new2"]) {
      const settings = parseSettings(
        JSON.stringify({
          treeViewMode,
          colorMap: "viridis",
          showErrorNodes: false,
          embeddingSource: "reasoning",
          mergeDiversityWeight: 0.25,
          unknownSetting: true,
        }),
      );

      assert.deepEqual(settings, {
        ...DEFAULT_SETTINGS,
        colorMap: "viridis",
        showErrorNodes: false,
        embeddingSource: "reasoning",
        mergeDiversityWeight: 0.25,
      });
      assert.equal(Object.hasOwn(settings, "treeViewMode"), false);
    }
  });

  test("missing or malformed storage keeps the current default settings", () => {
    for (const saved of [null, "", "{", "null", "[]", "true", '"classic"']) {
      assert.deepEqual(parseSettings(saved), DEFAULT_SETTINGS);
    }
  });

  test("preserves normalization of persisted Merge ranking weights", () => {
    for (const [savedWeight, expected] of [
      [-1, 0],
      [2, 1],
      [null, DEFAULT_SETTINGS.mergeDiversityWeight],
    ]) {
      assert.equal(
        parseSettings(JSON.stringify({ mergeDiversityWeight: savedWeight }))
          .mergeDiversityWeight,
        expected,
      );
    }
  });
});
