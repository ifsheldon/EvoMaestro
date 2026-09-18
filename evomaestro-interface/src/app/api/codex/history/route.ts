export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { CodexConversation } from "@/lib/codex-threads";
import { MaestroDataset } from "@/lib/maestro-access";

export async function GET(request: NextRequest) {
  const leftProgramId = request.nextUrl.searchParams.get("leftProgramId");
  const rightProgramId = request.nextUrl.searchParams.get("rightProgramId");
  const dataset = await MaestroDataset.resolve(
    request.nextUrl.searchParams.get("dbPath"),
  );
  if (dataset instanceof Response) return dataset;
  const { resultsDir } = dataset;

  if (!leftProgramId || !rightProgramId) {
    return Response.json(
      { error: "leftProgramId and rightProgramId are required" },
      { status: 400 },
    );
  }

  const conversation = CodexConversation.programPair(
    resultsDir,
    leftProgramId,
    rightProgramId,
  );
  return Response.json(await conversation.history());
}
