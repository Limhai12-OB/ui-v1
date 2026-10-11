import { ApiError } from "./http";

/** Fixed latencies keep the demo deterministic while still showing loading states. */
export const LATENCY = { fast: 250, normal: 550, slow: 1200, ai: 1600 } as const;

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run a mock operation against the local store after a simulated network delay.
 * Throw `ApiError` inside `fn` to simulate validation/business errors.
 */
export async function simulate<T>(fn: () => T, ms: number = LATENCY.normal): Promise<T> {
  await delay(ms);
  return fn();
}

export function mockError(message: string, status = 422, code = "VALIDATION_ERROR"): never {
  throw new ApiError(message, status, code);
}
