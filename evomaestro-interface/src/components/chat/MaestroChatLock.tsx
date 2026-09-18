"use client";

import { Bot, LockKeyhole, Send, X } from "lucide-react";
import { useI18n } from "@/i18n";

export default function MaestroChatLock({
  reason,
  onClose,
}: {
  reason: "mock-demo" | "mock-guide" | "checking";
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const message =
    reason === "mock-demo"
      ? t("chat.onlineDemoDisabled")
      : reason === "mock-guide"
        ? t("chat.guideDisabled")
        : t("chat.checkingAvailability");

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Bot className="w-4 h-4 text-emerald-500" />
          {t("workspace.maestroChat")}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title={t("common.close")}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div
        className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8 text-center"
        role="status"
      >
        <div className="rounded-full bg-gray-100 p-3">
          <LockKeyhole className="w-6 h-6 text-gray-400" />
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-gray-600">
          {message}
        </p>
      </div>
      <div className="flex gap-2 items-end px-4 py-3 bg-white border-t border-gray-200">
        <textarea
          disabled
          rows={2}
          placeholder={t("chat.unavailablePlaceholder")}
          aria-label={t("chat.unavailablePlaceholder")}
          className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 cursor-not-allowed"
        />
        <button
          type="button"
          disabled
          title={t("chat.send")}
          className="p-2 rounded-lg bg-gray-100 text-gray-300 cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
