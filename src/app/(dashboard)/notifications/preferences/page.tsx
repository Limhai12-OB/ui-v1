import type { Metadata } from "next";
import { NotificationPreferencesPage } from "@/features/notifications/preferences-page";

export const metadata: Metadata = { title: "Notification preferences" };

export default function Page() {
  return <NotificationPreferencesPage />;
}
