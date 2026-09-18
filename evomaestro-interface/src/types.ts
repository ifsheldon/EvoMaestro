export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export interface ProgramDiffSummary extends JsonObject {
  added?: number;
  deleted?: number;
  modified?: number;
}

export interface ProgramMetadata extends JsonObject {
  patch_name?: string;
  patch_type?: string;
  patch_description?: string;
  api_costs?: string;
  embed_cost?: string;
  novelty_cost?: string;
  meta_cost?: string;
  model_name?: string;
  stdout_log?: string;
  stderr_log?: string;
  error_type?: "runtime_error" | "timeout" | "crash";
  llm_result?: JsonValue;
  diff_summary?: ProgramDiffSummary;
  source?: JsonValue;
  human_prompt?: JsonValue;
  thought?: JsonValue;
}

export type ProgramReviewPriorityData = JsonObject;

export interface Program {
  id: string;
  parent_id: string | null;
  generation: number;
  score?: number | null;
  combined_score?: number | null;
  island_idx?: number | null;
  correct?: boolean | string | number;
  code: string;
  language?: string;
  implementation?: string;
  code_diff?: string;
  public_metrics?: Record<string, number>;
  private_metrics?: Record<string, number>;
  text_feedback?: string;
  archive_inspiration_ids?: string[];
  top_k_inspiration_ids?: string[];
  children_count?: number;
  timestamp?: number;
  embedding?: number[];
  embedding_pca_2d?: number[];
  embedding_pca_3d?: number[];
  embedding_cluster_id?: number;
  reasoning_embedding?: number[];
  reasoning_embedding_pca_2d?: number[];
  reasoning_embedding_cluster_id?: number | null;
  migration_history?: JsonObject[];
  metadata?: ProgramMetadata;
  complexity?: number;
  in_archive?: boolean;
  error?: string;
  review_priority_level?: "none" | "moderate" | "high";
  review_priority_data?: ProgramReviewPriorityData;
  /** Client-side lifecycle status: "queued" = pending evaluation, "generated" = complete. */
  _lifecycle?: "queued" | "generated";
}

export interface DatasetInfo {
  path: string;
  role: "run" | "mock-demo" | "mock-guide";
  read_only: boolean;
  maestro_chat_enabled: boolean;
  example_summary_generation: number | null;
}

export interface DatabaseFile {
  path: string;
  name: string;
  actual_path: string;
  sort_key?: string;
}

export interface MetaFile {
  generation: number;
  filename: string;
  path: string;
}

export interface MetaContent {
  generation: number;
  filename: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Interactive evolution types
// ---------------------------------------------------------------------------

export type RunState =
  | "running"
  | "paused"
  | "idle"
  | "waiting_for_start"
  | "completed"
  | "stopped"
  | "error"
  | "unknown";

export interface RunStatus {
  run_state: RunState;
  generation: number;
  best_score: number;
  queued_jobs: number;
  total_programs: number;
  target_generations: number;
  is_resuming: boolean;
  updated_at: number;
  generation_backend_heartbeat_at: number;
}

export type WSMessage =
  | { type: "programs.updated"; program_count: number; last_modified: number }
  | {
      type: "run.status";
      run_state: RunState;
      generation: number;
      best_score: number;
      queued_jobs: number;
      total_programs: number;
      target_generations: number;
      is_resuming: boolean;
      updated_at: number;
      generation_backend_heartbeat_at: number;
    }
  | {
      type: "review_priority.assigned";
      program_id: string;
      review_priority_level: "moderate" | "high";
      review_priority_data: ProgramReviewPriorityData;
      combined_score: number;
      generation: number;
    }
  | {
      type: "program.queued";
      program_id: string;
      parent_id: string | null;
      generation: number;
      code: string;
      code_diff?: string;
      timestamp: number;
      island_idx?: number;
      metadata?: ProgramMetadata;
      archive_inspiration_ids?: string[];
      top_k_inspiration_ids?: string[];
    }
  | {
      type: "program.generated";
      program: Program;
    };
