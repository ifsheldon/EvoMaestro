"use client";

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { useI18n } from "@/i18n";

function DefaultErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-gray-500">
      <div>
        <p className="mb-1 font-medium text-gray-700">
          {t("errors.somethingWentWrong")}
        </p>
        <p className="max-w-md text-xs text-gray-400">{error.message}</p>
        <button
          type="button"
          className="mt-3 rounded bg-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-300"
          onClick={onRetry}
        >
          {t("errors.tryAgain")}
        </button>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown when a render error is caught. Defaults to a generic message. */
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors in child components and displays a fallback UI
 * instead of unmounting the entire application.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return (
        <DefaultErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
