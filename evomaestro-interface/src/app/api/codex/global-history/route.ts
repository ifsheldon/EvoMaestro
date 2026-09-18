export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { CodexConversation } from "@/lib/codex-threads";
import { MaestroDataset } from "@/lib/maestro-access";

export async function GET(request: NextRequest) {
  const dataset = await MaestroDataset.resolve(
    request.nextUrl.searchParams.get("dbPath"),
  );
  if (dataset instanceof Response) return dataset;
  const { resultsDir } = dataset;

  const conversation = CodexConversation.global(resultsDir);
  return Response.json(await conversation.history());
}
