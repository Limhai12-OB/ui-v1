import type { Metadata } from "next";
import { ForecastingPage } from "@/features/forecasting/forecasting-page";

export const metadata: Metadata = { title: "Forecasting" };

export default function Page() {
  return <ForecastingPage />;
}
