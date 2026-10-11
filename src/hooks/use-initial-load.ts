"use client";

import { useEffect, useState } from "react";
import { LATENCY } from "@/lib/api/mock";

/**
 * Simulates the first network fetch of a page in mock mode so skeleton states
 * are visible and exercised. Replace with real query loading state when the
 * API is live.
 */
export function useInitialLoad(ms: number = LATENCY.normal): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}
