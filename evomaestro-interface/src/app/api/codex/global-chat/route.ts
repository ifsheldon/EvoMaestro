export const runtime = "nodejs";

import { streamCodexConversation } from "@/lib/codex-stream";
import { CodexConversation } from "@/lib/codex-threads";
import { MaestroDataset } from "@/lib/maestro-access";

interface GlobalChatRequest {
  threadId: string;
  message: string;
  dbPath: string;
}

export async function POST(request: Request) {
  let body: GlobalChatRequest;
  try {
    body = (await request.json()) as GlobalChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dataset = await MaestroDataset.resolve(body?.dbPath);
  if (dataset instanceof Response) return dataset;
  const { resultsDir } = dataset;

  const { threadId, message } = body;
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

  return streamCodexConversation(
    request,
    CodexConversation.global(resultsDir),
    message,
    undefined,
    threadId,
  );
}
