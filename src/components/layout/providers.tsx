"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUIStore } from "@/store/ui-store";

/** Keeps <html> theme class and lang attribute in sync with preferences. */
function DocumentSync() {
  const theme = useUIStore((s) => s.theme);
  const language = useUIStore((s) => s.language);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language === "km" ? "km" : "en";
  }, [language]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);
  return (
    <TooltipProvider delayDuration={200}>
      <DocumentSync />
      {children}
      <Toaster position="bottom-right" richColors closeButton theme={theme} toastOptions={{ className: "font-sans" }} />
    </TooltipProvider>
  );
}
