"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

interface ActionOptions<T> {
  /** Toast shown on success; a function receives the result. Omit for no toast. */
  success?: string | ((result: T) => string);
  /** Prefix for error toasts. */
  errorTitle?: string;
  onSuccess?: (result: T) => void;
}

/**
 * Run a service call with a pending flag and toast feedback.
 * Success toasts appear only after the mock/live service actually resolves.
 */
export function useAction<A extends unknown[], T>(fn: (...args: A) => Promise<T>, opts: ActionOptions<T> = {}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { success, errorTitle, onSuccess } = opts;

  const run = useCallback(
    async (...args: A): Promise<T | undefined> => {
      setPending(true);
      setError(null);
      try {
        const result = await fn(...args);
        if (success) toast.success(typeof success === "function" ? success(result) : success);
        onSuccess?.(result);
        return result;
      } catch (e) {
        const message = e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong. Please try again.";
        setError(message);
        toast.error(errorTitle ?? "Action failed", { description: message });
        throw e;
      } finally {
        setPending(false);
      }
    },
    [fn, success, errorTitle, onSuccess],
  );

  /** Same as run but swallows the error (already toasted) — handy in onClick. */
  const fire = useCallback((...args: A) => {
    run(...args).catch(() => undefined);
  }, [run]);

  return { run, fire, pending, error };
}
