import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { marked } from "marked";
import { extractGlobalInsights, overviewContent } from "./overviewContent";

describe("summary presentation", () => {
  test("missing and whitespace content use a fixture only for guide openings", () => {
    for (const content of [null, "", " \n "]) {
      assert.equal(overviewContent(content, false, false, "en"), null);
      assert.match(
        overviewContent(content, true, false, "en")?.label ?? "",
        /Illustrative/,
      );
      assert.match(
        overviewContent(content, true, false, "zh-CN")?.content ?? "",
        /模拟运行/,
      );
    }
  });

  test("a real summary is preserved during the guide", () => {
    assert.deepEqual(
      overviewContent("Real experimental findings", true, false, "en"),
      {
        content: "Real experimental findings",
        label: null,
      },
    );
  });

  test("a packaged fixture is labeled and localized outside the guide too", () => {
    const english = overviewContent("Packaged fixture", false, true, "en");
    const chinese = overviewContent("Packaged fixture", false, true, "zh-CN");
    assert.match(english?.label ?? "", /mock data/);
    assert.match(chinese?.label ?? "", /模拟数据/);
    assert.notEqual(chinese?.content, english?.content);
  });

  test("an empty scratchpad remains absent and unrelated sections are excluded", () => {
    assert.equal(
      extractGlobalInsights(
        "# GLOBAL INSIGHTS SCRATCHPAD\n \n# RECOMMENDATIONS\nTry something",
      ),
      "",
    );
    assert.equal(
      extractGlobalInsights(
        "# GLOBAL INSIGHTS SCRATCHPAD\n\n## Patterns\nA useful idea\n# RECOMMENDATIONS\nNext",
      ),
      "## Patterns\nA useful idea",
    );
  });

  test("code comments and section names inside fences cannot truncate insights", () => {
    for (const fence of ["```", "~~~~"]) {
      const insights = [
        "## Example",
        `${fence}python`,
        "# EVOLVE-BLOCK-START",
        "# META RECOMMENDATIONS",
        "print(42)",
        "# EVOLVE-BLOCK-END",
        fence,
        "",
        "Text after the code.",
      ].join("\n");
      const source = [
        "# INDIVIDUAL PROGRAM SUMMARIES",
        fence,
        "# GLOBAL INSIGHTS SCRATCHPAD",
        "An example heading inside earlier code.",
        fence,
        "",
        "# GLOBAL INSIGHTS SCRATCHPAD",
        insights,
        "",
        "# META RECOMMENDATIONS",
        "Excluded next steps.",
      ].join("\n");
      const extracted = extractGlobalInsights(source);
      assert.equal(extracted, insights);
      assert.match(marked.parse(extracted) as string, /print\(42\)/);
    }
  });

  test("indented code and nested headings remain until the next top-level section", () => {
    const insights =
      "## Patterns\n\n    # CODE COMMENT\n    return 42\n\nStill here.";
    assert.equal(
      extractGlobalInsights(
        `# GLOBAL INSIGHTS SCRATCHPAD\n\n${insights}\n\n# Next section\nExcluded`,
      ),
      insights,
    );
    assert.equal(extractGlobalInsights(`  ${insights}\n`), insights);
  });
});
