import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseReviewPriorityAssignedMessage } from "./wsMessages";

describe("review-priority WebSocket messages", () => {
  test("parses the canonical assignment event", () => {
    const parsed = parseReviewPriorityAssignedMessage({
      type: "review_priority.assigned",
      program_id: "p-42",
      review_priority_level: "high",
      review_priority_data: { mode: "score_change", gain_pct: 35 },
      combined_score: 1.25,
      generation: 8,
    });

    assert.equal(parsed?.program_id, "p-42");
    assert.equal(parsed?.review_priority_level, "high");
  });

  test("rejects the legacy event and malformed priority values", () => {
    assert.equal(
      parseReviewPriorityAssignedMessage({
        type: "novelty.detected",
        program_id: "p-42",
      }),
      null,
    );
    assert.equal(
      parseReviewPriorityAssignedMessage({
        type: "review_priority.assigned",
        program_id: "p-42",
        review_priority_level: "urgent",
        review_priority_data: {},
        combined_score: 1.25,
        generation: 8,
      }),
      null,
    );
  });
});
