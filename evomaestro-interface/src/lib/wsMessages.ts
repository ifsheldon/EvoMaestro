import type { WSMessage } from "@/types";

export type ReviewPriorityAssignedMessage = Extract<
  WSMessage,
  { type: "review_priority.assigned" }
>;

export function parseReviewPriorityAssignedMessage(
  value: unknown,
): ReviewPriorityAssignedMessage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const message = value as Record<string, unknown>;
  if (message.type !== "review_priority.assigned") return null;
  if (typeof message.program_id !== "string") return null;
  if (
    message.review_priority_level !== "moderate" &&
    message.review_priority_level !== "high"
  ) {
    return null;
  }
  if (
    typeof message.review_priority_data !== "object" ||
    message.review_priority_data === null ||
    Array.isArray(message.review_priority_data)
  ) {
    return null;
  }
  if (typeof message.combined_score !== "number") return null;
  if (typeof message.generation !== "number") return null;

  return message as unknown as ReviewPriorityAssignedMessage;
}
