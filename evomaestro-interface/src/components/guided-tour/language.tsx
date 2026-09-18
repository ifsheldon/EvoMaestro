"use client";

import type { CSSProperties, ReactNode } from "react";

import { useI18n } from "@/i18n";

function useIsChinese(): boolean {
  return useI18n().locale === "zh-CN";
}

export function BilingualContent({ en, zh }: { en: ReactNode; zh: ReactNode }) {
  const isChinese = useIsChinese();
  return (
    <div className="text-left text-sm leading-relaxed">
      {isChinese ? zh : en}
    </div>
  );
}

export function LangContent({
  en,
  zh,
  className,
  style,
}: {
  en: ReactNode;
  zh: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const isChinese = useIsChinese();
  return (
    <div
      className={className ?? "text-left text-sm leading-relaxed"}
      style={style}
    >
      {isChinese ? zh : en}
    </div>
  );
}

export function TourWelcomeStep() {
  const { t } = useI18n();
  return (
    <div className="text-center">
      <p className="mb-2 text-base font-semibold">{t("tour.welcomeTitle")}</p>
      <p className="mb-3 text-sm text-gray-600">
        {t("tour.welcomeDescription")}
      </p>
      <p className="text-sm text-gray-600">{t("guide.notice")}</p>
    </div>
  );
}

export function TourEndStep() {
  const { t } = useI18n();
  return (
    <div className="text-center">
      <p className="mb-2 text-base font-semibold">{t("tour.completeTitle")}</p>
      <p className="mb-4 text-sm text-gray-500">
        {t("tour.completeDescription")}
      </p>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          onClick={() => window.dispatchEvent(new CustomEvent("tour:finish"))}
        >
          {t("common.finish")}
        </button>
        <button
          type="button"
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("tour:more-details"))
          }
        >
          {t("common.moreDetails")}
        </button>
      </div>
    </div>
  );
}
