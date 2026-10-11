"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Building2, Coins, FlaskConical, LayoutDashboard, Palette } from "lucide-react";
import { useCan } from "@/hooks/use-scope";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessProfileTab } from "./business-profile-tab";
import { CurrencyTab } from "./currency-tab";
import { AppearanceTab, DashboardTab, DemoDataTab } from "./preference-tabs";

const TABS = ["business", "currency", "appearance", "dashboard", "demo"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isOwner = useCan("business.settings");
  const canResetDemo = useCan("demo.reset");
  const available = TABS.filter((t) => t !== "demo" || canResetDemo);
  const raw = params.get("tab") as Tab | null;
  const tab: Tab = raw && available.includes(raw) ? raw : "business";

  const setTab = (t: string) => {
    const sp = new URLSearchParams(params.toString());
    if (t === "business") sp.delete("tab");
    else sp.set("tab", t);
    const q = sp.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description={isOwner ? "Manage your business profile, currency rules and workspace preferences." : "View the business profile and adjust your own workspace preferences. Business settings are managed by the Business Owner."}
      />
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max">
            <TabsTrigger value="business">
              <Building2 /> Business profile
            </TabsTrigger>
            <TabsTrigger value="currency">
              <Coins /> Currency &amp; language
            </TabsTrigger>
            <TabsTrigger value="appearance">
              <Palette /> Appearance
            </TabsTrigger>
            <TabsTrigger value="dashboard">
              <LayoutDashboard /> Dashboard
            </TabsTrigger>
            {canResetDemo && (
              <TabsTrigger value="demo">
                <FlaskConical /> Demo &amp; data
              </TabsTrigger>
            )}
          </TabsList>
        </div>
        <TabsContent value="business">
          <BusinessProfileTab />
        </TabsContent>
        <TabsContent value="currency">
          <CurrencyTab />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="dashboard">
          <DashboardTab />
        </TabsContent>
        {canResetDemo && (
          <TabsContent value="demo">
            <DemoDataTab />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
