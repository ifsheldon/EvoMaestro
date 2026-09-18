export const runtime = "nodejs";

import { streamCodexConversation } from "@/lib/codex-stream";
import { CodexConversation } from "@/lib/codex-threads";
import { MaestroDataset } from "@/lib/maestro-access";

type ChatMode = "code_change" | "code_diff" | "code_view";

interface StartRequest {
  mode?: ChatMode;
  dbPath: string;
  taskDescription: string;
  leftProgramId: string;
  rightProgramId: string;
  leftGen: number;
  rightGen: number;
  leftScore?: number | null;
  rightScore?: number | null;
  language: string;
  userMessage: string;
}

function getFileExt(language: string): string {
  return language === "python"
    ? "py"
    : language === "javascript"
      ? "js"
      : language;
}

function fmtScore(score?: number | null): string {
  return score != null ? score.toFixed(4) : "unknown";
}

function buildTaskSection(taskDescription: string): string {
  return `## Task Description
\`\`\`markdown
${taskDescription || "(No task description available)"}
\`\`\``;
}

const CODE_NOTE_INSTRUCTION_SINGLE = `

## Code Annotations
When explaining code, you can annotate specific lines using note blocks. The frontend will highlight those lines and show your note. Use this format:

\\\`\\\`\\\`note{startLine:endLine}
Your explanation of these lines
\\\`\\\`\\\`

For example, \\\`\\\`\\\`note{15:22} will highlight lines 15–22. Use multiple note blocks to annotate different sections. This helps the user follow your explanation in the code editor.`;

const CODE_NOTE_INSTRUCTION_DIFF = `

## Code Annotations
When explaining code differences, you can annotate specific lines using note blocks. The frontend will highlight those lines and show your note. Use this format:

\\\`\\\`\\\`note{left:startLine:endLine}
Your explanation of the original code
\\\`\\\`\\\`

\\\`\\\`\\\`note{right:startLine:endLine}
Your explanation of the modified code
\\\`\\\`\\\`

Use \`left\` for the original/parent code and \`right\` for the modified/child code. Use multiple note blocks to annotate different sections. This helps the user follow your explanation in the diff editor.`;

const DB_FALLBACK_NOTE = `
**Important:** Some gen_N/ folders may be missing from disk. If a file is not found, query the SQLite database \`programs.sqlite\` in the working directory instead. The \`programs\` table has columns including \`id\`, \`generation\`, \`code\`, \`combined_score\`, \`correct\`, \`code_diff\`, and \`metadata\`. Use \`SELECT code FROM programs WHERE generation = <N>\` to retrieve the source code.`;

function buildSystemContext(req: StartRequest): string {
  const ext = getFileExt(req.language);
  const mode = req.mode ?? "code_change";

  if (mode === "code_view") {
    const score = fmtScore(req.rightScore);
    return `You are helping a researcher understand a program in ShinkaEvolve, an evolutionary code optimization system.

${buildTaskSection(req.taskDescription)}

## Program Under Review
- Node ${req.rightGen} (score: ${score}) → gen_${req.rightGen}/main.${ext}

Read the file and help the user understand the code, its approach, and potential improvements.
${DB_FALLBACK_NOTE}
${CODE_NOTE_INSTRUCTION_SINGLE}`;
  }

  const leftScore = fmtScore(req.leftScore);
  const rightScore = fmtScore(req.rightScore);

  if (mode === "code_diff") {
    return `You are helping a researcher compare two programs in ShinkaEvolve, an evolutionary code optimization system.

${buildTaskSection(req.taskDescription)}

## Programs Being Compared
- Program A: Node ${req.leftGen} (score: ${leftScore}) → gen_${req.leftGen}/main.${ext}
- Program B: Node ${req.rightGen} (score: ${rightScore}) → gen_${req.rightGen}/main.${ext}

Read both files and help the user compare approaches, trade-offs, and differences between these two programs.
${DB_FALLBACK_NOTE}
${CODE_NOTE_INSTRUCTION_DIFF}`;
  }

  // code_change (parent → child)
  return `You are helping a researcher analyze a code mutation in ShinkaEvolve, an evolutionary code optimization system.

${buildTaskSection(req.taskDescription)}

## Code Change (Parent → Child)
- Parent: Node ${req.leftGen} (score: ${leftScore}) → gen_${req.leftGen}/main.${ext}
- Child: Node ${req.rightGen} (score: ${rightScore}) → gen_${req.rightGen}/main.${ext}

Read both files and help the user understand what changed, why the mutation was made, and how it affected the score.
${DB_FALLBACK_NOTE}
${CODE_NOTE_INSTRUCTION_DIFF}`;
}

export async function POST(request: Request) {
  let body: StartRequest;
  try {
    body = (await request.json()) as StartRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dataset = await MaestroDataset.resolve(body?.dbPath);
  if (dataset instanceof Response) return dataset;
  const { resultsDir } = dataset;

  const { leftProgramId, rightProgramId, userMessage } = body;

  if (typeof userMessage !== "string" || !userMessage.trim()) {
    return Response.json({ error: "userMessage is required" }, { status: 400 });
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
    userMessage,
    buildSystemContext(body),
  );
}
