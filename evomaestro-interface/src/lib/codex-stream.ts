import {
  Codex,
  type RunStreamedResult,
  type ThreadEvent,
} from "@openai/codex-sdk";
import { type CodexConversation, findSessionFile } from "./codex-threads";

/** Stream a turn while keeping all writes conditional on its conversation claim. */
export async function streamCodexConversation(
  request: Request,
  conversation: CodexConversation,
  message: string,
  systemContext?: string,
  expectedThreadId?: string,
): Promise<Response> {
  if (
    expectedThreadId !== undefined &&
    conversation.entry?.threadId !== expectedThreadId
  ) {
    return Response.json(
      { error: "Conversation does not belong to this dataset and selection" },
      { status: 403 },
    );
  }

  let turn: ReturnType<CodexConversation["begin"]>;
  try {
    turn = conversation.begin(request.signal);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start conversation",
      },
      { status: request.signal.aborted ? 499 : 500 },
    );
  }

  try {
    const codex = new Codex();
    let thread = turn.threadId
      ? codex.resumeThread(turn.threadId, { sandboxMode: "danger-full-access" })
      : codex.startThread({
          workingDirectory: conversation.resultsDir,
          skipGitRepoCheck: true,
          sandboxMode: "danger-full-access",
        });
    const prompt = turn.threadId
      ? message
      : `${systemContext ?? ""}\n\n---\n\nUser question: ${message}`;
    let result: RunStreamedResult;
    try {
      result = await thread.runStreamed(prompt, { signal: turn.signal });
    } catch (error) {
      // A missing cached session may be restarted by a start route with full context.
      // A reset or cancelled request must never enter this recovery path.
      if (!turn.threadId || systemContext === undefined || !turn.save(null)) {
        throw error;
      }
      thread = codex.startThread({
        workingDirectory: conversation.resultsDir,
        skipGitRepoCheck: true,
        sandboxMode: "danger-full-access",
      });
      result = await thread.runStreamed(
        `${systemContext}\n\n---\n\nUser question: ${message}`,
        { signal: turn.signal },
      );
    }
    const { events } = result;
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: object) => {
          if (!cancelled && turn.isCurrent()) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          }
        };
        try {
          for await (const event of events) {
            if (!turn.isCurrent()) break;
            // Persist the identity as soon as the SDK provides it, including interrupted turns.
            if (event.type === "thread.started") turn.save(event.thread_id);
            const payload = streamPayload(event);
            if (payload) send(payload);
          }
          if (!turn.isCurrent()) return;
          const threadId = thread.id ?? turn.threadId;
          if (!threadId)
            throw new Error("Maestro did not provide a conversation ID");
          if (!turn.save(threadId)) return;
          const sessionPath = await findSessionFile(threadId);
          if (!turn.isCurrent()) return;
          if (sessionPath) turn.save(threadId, sessionPath);
          send({ type: "done", threadId });
        } catch (error) {
          send({
            type: "error",
            error:
              error instanceof Error ? error.message : "Unknown Codex error",
          });
        } finally {
          turn.finish();
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        turn.abort();
        turn.finish();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    turn.finish();
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown Codex error" },
      { status: turn.signal.aborted ? 499 : 500 },
    );
  }
}

function streamPayload(event: ThreadEvent): object | null {
  if (event.type === "error") throw new Error(event.message);
  if (event.type === "turn.failed") throw new Error(event.error.message);
  if (event.type !== "item.completed") return null;
  const item = event.item;
  if (item.type === "agent_message" || item.type === "reasoning") {
    return { type: item.type, text: item.text };
  }
  if (item.type === "command_execution") {
    return {
      type: "command",
      command: item.command,
      output: item.aggregated_output,
      exitCode: item.exit_code ?? null,
    };
  }
  return null;
}
