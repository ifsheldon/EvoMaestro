import path from "node:path";

/** A dataset authorized by the backend, with its canonical working directory. */
export class MaestroDataset {
  private constructor(readonly resultsDir: string) {}

  static async resolve(value: unknown): Promise<MaestroDataset | Response> {
    if (process.env.EVOMAESTRO_PUBLIC_DEMO === "1") {
      return Response.json(
        { error: "Maestro Chat is disabled for the public demo" },
        { status: 403 },
      );
    }

    if (typeof value !== "string" || !value.trim()) {
      return Response.json({ error: "dbPath is required" }, { status: 400 });
    }

    try {
      const url = new URL(
        "/maestro_context",
        process.env.API_PROXY ?? "http://127.0.0.1:8000",
      );
      url.searchParams.set("db_path", value);
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        const status = [400, 403, 404].includes(response.status)
          ? response.status
          : 503;
        return Response.json(
          {
            error:
              status === 403
                ? "Maestro Chat is disabled for this mock dataset"
                : "Unable to authorize Maestro Chat for this dataset",
          },
          { status },
        );
      }
      const context: unknown = await response.json();
      if (
        typeof context !== "object" ||
        context === null ||
        !("results_dir" in context) ||
        typeof context.results_dir !== "string" ||
        !path.isAbsolute(context.results_dir)
      ) {
        throw new Error("Invalid Maestro context");
      }
      return new MaestroDataset(context.results_dir);
    } catch {
      // No backend authorization means no model or session-file access.
      return Response.json(
        { error: "Unable to authorize Maestro Chat for this dataset" },
        { status: 503 },
      );
    }
  }
}
