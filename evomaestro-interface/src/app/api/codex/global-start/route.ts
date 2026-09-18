export const runtime = "nodejs";

import { streamCodexConversation } from "@/lib/codex-stream";
import { CodexConversation } from "@/lib/codex-threads";
import { MaestroDataset } from "@/lib/maestro-access";

interface GlobalStartRequest {
  dbPath: string;
  taskDescription: string;
  language: string;
  programCount: number;
  userMessage: string;
}

function buildGlobalSystemContext(req: GlobalStartRequest): string {
  const ext =
    req.language === "python"
      ? "py"
      : req.language === "javascript"
        ? "js"
        : req.language;

  return `You are an AI research assistant helping a researcher analyze an evolutionary code optimization experiment run by ShinkaEvolve.

## Task Description
\`\`\`markdown
${req.taskDescription || "(No task description available)"}
\`\`\`

## Experiment Overview
- Language: ${req.language}
- Total programs evolved so far: ${req.programCount}
- Working directory: the results folder for this experiment run

## Directory Structure
The working directory contains:
- \`programs.sqlite\` — SQLite database with all programs. The \`programs\` table has columns: \`id\`, \`generation\`, \`code\`, \`combined_score\`, \`correct\`, \`code_diff\`, \`metadata\` (JSON), \`timestamp\`, \`island_idx\`, \`review_priority_level\`, and more. Use SQL queries to explore.
- \`experiment_config.yaml\` — Full experiment configuration (mutation strategy, island settings, scoring, etc.)
- \`evolution_run.log\` — Log of the evolution process
- \`best/\` — The current best program (same structure as gen_N/)
- \`gen_N/\` folders — Each generation's data:
  - \`main.${ext}\` — The evolved source code for this generation
  - \`original.${ext}\` — The parent's source code before mutation
  - \`edit.diff\` — The diff between original and mutated code
  - \`rewrite.txt\` — The LLM's rewrite/mutation instructions
  - \`results/metrics.json\` — Scoring breakdown (combined_score, individual objectives, text_feedback)
  - \`results/correct.json\` — Whether the program passed validation
  - \`results/job_log.out\`, \`results/job_log.err\` — Evaluation stdout/stderr
  - \`attempts/\` — Failed mutation attempts (if any)
- \`meta_N.txt\` (or \`meta/meta_N.txt\`) (when available) — AI-generated analysis of generation N, containing diffs, scoring breakdowns, and a cumulative **GLOBAL INSIGHTS SCRATCHPAD** that tracks the overall evolution strategy, key discoveries, and patterns across all generations. The latest meta file has the most complete scratchpad.

## Your Role
Help the researcher understand the overall evolution process. You can:
- Query the database to analyze score trends, mutation patterns, and island dynamics
- Read metrics.json files to understand scoring breakdowns per generation
- Read edit.diff and rewrite.txt to understand what mutations were attempted and why
- Read source code (main.${ext}) to explain specific implementations
- Read meta_N.txt files (when available) to understand the AI's cumulative reasoning
- Compare generations by reading their code and metrics side by side
- Provide high-level insights about the evolution trajectory

When conversing with the user, do not mention "Generation <N>". Use "Node <N>" instead, as "Generation" confuses the user with the concept of "Evolutionary Generations" and "Generations" that produces something.

Start by querying the database and meta files for an overview if the user's question requires global context.`;
}

export async function POST(request: Request) {
  let body: GlobalStartRequest;
  try {
    body = (await request.json()) as GlobalStartRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dataset = await MaestroDataset.resolve(body?.dbPath);
  if (dataset instanceof Response) return dataset;
  const { resultsDir } = dataset;

  const { userMessage } = body;
  if (typeof userMessage !== "string" || !userMessage.trim()) {
    return Response.json({ error: "userMessage is required" }, { status: 400 });
  }

  return streamCodexConversation(
    request,
    CodexConversation.global(resultsDir),
    userMessage,
    buildGlobalSystemContext(body),
  );
}
