export const runtime = "nodejs";

import { streamCodexConversation } from "@/lib/codex-stream";
import { CodexConversation } from "@/lib/codex-threads";
import { MaestroDataset } from "@/lib/maestro-access";

interface ChatRequest {
  threadId: string;
  message: string;
  leftProgramId: string;
  rightProgramId: string;
  dbPath: string;
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dataset = await MaestroDataset.resolve(body?.dbPath);
  if (dataset instanceof Response) return dataset;
  const { resultsDir } = dataset;

  const { threadId, message, leftProgramId, rightProgramId } = body;

  if (
    typeof threadId !== "string" ||
    !threadId ||
    typeof message !== "string" ||
    !message.trim()
  ) {
    return Response.json(
      { error: "threadId and message are required" },
      { status: 400 },
    );
  }

  if (
    typeof leftProgramId !== "string" ||
    !leftProgramId ||
    typeof rightProgramId !== "string" ||
    !rightProgramId
  ) {
    return Response.json(
      { error: "leftProgramId and rightProgramId are required" },
      { status: 400 },
    );
  }

  return streamCodexConversation(
    request,
    CodexConversation.programPair(resultsDir, leftProgramId, rightProgramId),
    message,
    undefined,
    threadId,
  );
}
