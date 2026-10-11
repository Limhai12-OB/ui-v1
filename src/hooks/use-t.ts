"use client";

import { useCallback } from "react";
import { useUIStore } from "@/store/ui-store";
import { translate, type TranslationKey } from "@/lib/i18n";

export function useT() {
  const lang = useUIStore((s) => s.language);
  return useCallback((key: TranslationKey) => translate(lang, key), [lang]);
}
