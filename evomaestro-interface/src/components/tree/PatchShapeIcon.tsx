"use client";

import { useI18n } from "@/i18n";

interface PatchShapeIconProps {
  type: string;
}

export function PatchShapeIcon({ type }: PatchShapeIconProps) {
  const { t } = useI18n();
  switch (type) {
    case "init":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className="inline-block"
          role="img"
          aria-label={t("patchShape.init")}
        >
          <path
            d="M 7 2 L 11 7 L 7 12 L 3 7 Z"
            fill="none"
            stroke="black"
            strokeWidth="2"
          />
        </svg>
      );
    case "diff":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className="inline-block"
          role="img"
          aria-label={t("patchShape.diff")}
        >
          <rect
            x="2"
            y="2"
            width="10"
            height="10"
            fill="none"
            stroke="black"
            strokeWidth="2"
          />
        </svg>
      );
    case "full":
    case "mutation":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className="inline-block"
          role="img"
          aria-label={t("patchShape.mutation")}
        >
          <circle
            cx="7"
            cy="7"
            r="5"
            fill="none"
            stroke="black"
            strokeWidth="2"
          />
        </svg>
      );
    case "cross":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className="inline-block"
          role="img"
          aria-label={t("patchShape.cross")}
        >
          <path
            d="M 2 7 L 12 7 M 7 2 L 7 12"
            fill="none"
            stroke="black"
            strokeWidth="2"
          />
        </svg>
      );
    case "start":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className="inline-block"
          role="img"
          aria-label={t("patchShape.start")}
        >
          <path
            d="M 7 2 L 8.5 5.5 L 12 6 L 9.5 8.5 L 10 12 L 7 10.5 L 4 12 L 4.5 8.5 L 2 6 L 5.5 5.5 Z"
            fill="#9b59b6"
            stroke="black"
            strokeWidth="1"
          />
        </svg>
      );
    default:
      return (
        <span className="w-3 h-3 border-2 border-black inline-block"></span>
      );
  }
}
