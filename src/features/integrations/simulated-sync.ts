import type { IntegrationId } from "@/types";
import { integrationService } from "@/lib/api";
import { delay } from "@/lib/api/mock";
import { nowISO } from "@/lib/date";
import { uid, useAppStore } from "@/store/app-store";

/**
 * Simulated "Sync now": marks the integration as syncing, records a running
 * run, then finishes ~2s later. No records are created, so the run says so.
 * Runs outside React so it completes even if the user navigates away.
 */
export async function runSimulatedSync(id: IntegrationId): Promise<void> {
  const runId = uid("sync");
  const startedAt = nowISO();
  await integrationService.update(id, { status: "syncing" });
  await integrationService.addRun(id, { id: runId, startedAt, status: "running", recordsProcessed: 0, message: "Sync in progress (simulated)" });
  await delay(2000);
  const finishedAt = nowISO();
  await integrationService.addRun(id, { id: runId, startedAt, finishedAt, status: "success", recordsProcessed: 0, message: "Simulated sync — no new records imported" });
  // Only restore "connected" if nobody disconnected the integration meanwhile.
  const current = useAppStore.getState().integrations.find((i) => i.id === id);
  if (current?.status === "syncing") await integrationService.update(id, { status: "connected", lastSyncAt: finishedAt });
}
