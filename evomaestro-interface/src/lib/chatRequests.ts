type ChatRequestKind = "history" | "send" | "reset";

/** Own one conversation's requests so stale history and streams cannot revive it. */
export class ChatRequests {
  private active: {
    kind: ChatRequestKind;
    controller: AbortController;
  } | null = null;

  start(kind: ChatRequestKind): AbortController | null {
    if (
      this.active?.kind === "reset" ||
      (this.active?.kind === "send" && kind !== "reset")
    ) {
      return null;
    }
    this.cancel();
    const controller = new AbortController();
    this.active = { kind, controller };
    return controller;
  }

  finish(controller: AbortController): void {
    if (this.active?.controller === controller) this.active = null;
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = null;
  }
}
