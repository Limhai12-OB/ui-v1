"use client";

import { useEffect, useState } from "react";

/** True after the first client render — persisted stores are safe to read. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
