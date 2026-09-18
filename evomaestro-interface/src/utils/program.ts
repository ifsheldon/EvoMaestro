import type { Program } from "@/types";

export const isCorrectProgram = (program: Program): boolean => {
  return (
    program.correct === true ||
    program.correct === 1 ||
    program.correct === "true"
  );
};

export const getErrorType = (program: Program): string | undefined => {
  return program.metadata?.error_type;
};

export const isTimeoutProgram = (program: Program): boolean => {
  return program.metadata?.error_type === "timeout";
};

export const getProgramScore = (program: Program): number | null => {
  if (typeof program.combined_score === "number") {
    return program.combined_score;
  }
  if (typeof program.score === "number") {
    return program.score;
  }
  return null;
};

export const getProgramName = (program: Program): string => {
  return program.metadata?.patch_name || "unnamed";
};

export const formatScore = (score: number | null | undefined): string => {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return "N/A";
  }
  return score.toFixed(6);
};

export const formatTimestamp = (timestamp: unknown): string => {
  if (timestamp === null || timestamp === undefined || timestamp === "") {
    return "unknown";
  }

  const tsString = String(timestamp);
  if (tsString === "latest" || tsString === "unknown") {
    return tsString;
  }

  const numeric = Number(tsString);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    const date = new Date(numeric * 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds(),
    )}`;
  }

  const tsRegex = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/;
  const match = tsString.match(tsRegex);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  return tsString;
};
