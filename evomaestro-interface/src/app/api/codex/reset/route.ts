export const runtime = "nodejs";

import { CodexConversation } from "@/lib/codex-threads";
import { MaestroDataset } from "@/lib/maestro-access";

export async function POST(request: Request) {
  let body: {
    dbPath?: unknown;
    leftProgramId?: unknown;
    rightProgramId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const dataset = await MaestroDataset.resolve(body?.dbPath);
  if (dataset instanceof Response) return dataset;
  const { leftProgramId, rightProgramId } = body;
  let conversation: CodexConversation;
  if (leftProgramId === undefined && rightProgramId === undefined) {
    conversation = CodexConversation.global(dataset.resultsDir);
  } else if (
    typeof leftProgramId === "string" &&
    leftProgramId &&
    typeof rightProgramId === "string" &&
    rightProgramId
  ) {
    conversation = CodexConversation.programPair(
      dataset.resultsDir,
      leftProgramId,
      rightProgramId,
    );
  } else {
    return Response.json(
      { error: "leftProgramId and rightProgramId must both be provided" },
      { status: 400 },
    );
  }
  try {
    conversation.reset();
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Unable to clear the saved conversation" },
      { status: 500 },
    );
  }
}
