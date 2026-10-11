"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Eye, MoreHorizontal, Pencil, Plus, Power, Star, UserPlus } from "lucide-react";
import type { Branch } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { branchService } from "@/lib/api";
import { currentPeriods, periodTotals, type PeriodTotals } from "@/lib/analytics";
import { lowStockEntries } from "@/lib/domain";
import { formatDate } from "@/lib/date";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConvertedMoney, ConversionNote } from "@/components/shared/money";
import { StatCard } from "@/components/shared/stat";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Row {
  branch: Branch;
  managerName?: string;
  managerStatus?: string;
  totals: PeriodTotals;
  lowStock: number;
}

export function BranchesPage() {
  const router = useRouter();
  const loading = useInitialLoad();
  const branches = useAppStore((s) => s.branches);
  const managers = useAppStore((s) => s.managers);
  const transactions = useAppStore((s) => s.transactions);
  const items = useAppStore((s) => s.items);
  const { money } = useScope();
  const [toggling, setToggling] = useState<Branch | undefined>();
  const periods = currentPeriods();

  const setStatus = useAction(
    async (b: Branch): Promise<string> => {
      await branchService.update(b.id, { status: b.status === "active" ? "inactive" : "active" });
      return b.status === "active" ? `${b.name} deactivated` : `${b.name} reactivated`;
    },
    { success: (msg) => msg },
  );

  const rows = useMemo<Row[]>(
    () =>
      branches.map((b) => {
        const m = managers.find((x) => x.id === b.managerId && x.branchId === b.id);
        return {
          branch: b,
          managerName: m?.name,
          managerStatus: m?.status,
          totals: periodTotals(transactions, periods.start, periods.end, { branchIds: [b.id] }, money),
          lowStock: lowStockEntries(items, b.id).length,
        };
      }),
    [branches, managers, transactions, items, money, periods.start, periods.end],
  );

  const all = useMemo(() => periodTotals(transactions, periods.start, periods.end, { branchIds: branches.map((b) => b.id) }, money), [transactions, branches, money, periods.start, periods.end]);
  const prev = useMemo(() => periodTotals(transactions, periods.prevStart, periods.prevEnd, { branchIds: branches.map((b) => b.id) }, money), [transactions, branches, money, periods.prevStart, periods.prevEnd]);
  const active = branches.filter((b) => b.status === "active").length;
  const withoutManager = branches.filter((b) => !b.isMain && b.status === "active" && !b.managerId).length;
  const converted = rows.some((r) => r.totals.converted);
  const excluded = rows.some((r) => r.totals.excludedForeign);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: "name",
        accessorFn: (r) => r.branch.name,
        header: ({ column }) => <SortHeader column={column} title="Branch" />,
        meta: { label: "Branch" },
        cell: ({ row }) => (
          <div className="min-w-44">
            <Link href={`/branches/${row.original.branch.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.original.branch.name}
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono">{row.original.branch.code}</span>
              {row.original.branch.isMain && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  <Star /> Main
                </Badge>
              )}
            </div>
          </div>
        ),
      },
      { id: "city", accessorFn: (r) => r.branch.city, header: ({ column }) => <SortHeader column={column} title="City" />, meta: { label: "City" } },
      {
        id: "status",
        accessorFn: (r) => r.branch.status,
        header: "Status",
        meta: { label: "Status" },
        cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
      },
      {
        id: "manager",
        accessorFn: (r) => r.managerName ?? "",
        header: ({ column }) => <SortHeader column={column} title="Manager" />,
        meta: { label: "Manager" },
        cell: ({ row }) =>
          row.original.managerName ? (
            <div className="flex flex-col items-start gap-0.5">
              <span>{row.original.managerName}</span>
              {row.original.managerStatus !== "active" && <StatusBadge status={row.original.managerStatus!} />}
            </div>
          ) : row.original.branch.isMain ? (
            <span className="text-muted-foreground">Managed by owner</span>
          ) : (
            <span className="text-muted-foreground">No manager</span>
          ),
      },
      {
        id: "revenue",
        accessorFn: (r) => r.totals.revenue.value,
        header: ({ column }) => <SortHeader column={column} title="MTD revenue" align="right" />,
        meta: { align: "right", label: "MTD revenue" },
        cell: ({ row }) => <ConvertedMoney sum={row.original.totals.revenue} currency={money.display} rate={money.rate} />,
      },
      {
        id: "net",
        accessorFn: (r) => r.totals.net,
        header: ({ column }) => <SortHeader column={column} title="MTD net" align="right" />,
        meta: { align: "right", label: "MTD net" },
        cell: ({ row }) => (
          <span className={cn("tabular-nums whitespace-nowrap", row.original.totals.net < 0 ? "text-error-text" : "text-success-text")}>
            {row.original.totals.converted && "≈ "}
            {formatMoney(row.original.totals.net, money.display, { signed: true })}
          </span>
        ),
      },
      {
        id: "lowStock",
        accessorFn: (r) => r.lowStock,
        header: ({ column }) => <SortHeader column={column} title="Low stock" align="right" />,
        meta: { align: "right", label: "Low stock" },
        cell: ({ getValue }) => {
          const n = getValue() as number;
          return n > 0 ? (
            <Badge variant="warning" className="tabular-nums">
              {n} item{n === 1 ? "" : "s"}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "opened",
        accessorFn: (r) => r.branch.openedAt,
        header: ({ column }) => <SortHeader column={column} title="Opened" />,
        meta: { label: "Opened" },
        cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDate(getValue() as string)}</span>,
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: { align: "right" },
        cell: ({ row }) => {
          const b = row.original.branch;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${b.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/branches/${b.id}`}>
                      <Eye /> View details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/branches/${b.id}/edit`}>
                      <Pencil /> Edit
                    </Link>
                  </DropdownMenuItem>
                  {!b.managerId && !b.isMain && (
                    <DropdownMenuItem asChild>
                      <Link href={`/branch-managers/invite?branch=${b.id}`}>
                        <UserPlus /> Invite manager
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant={b.status === "active" ? "destructive" : "default"} disabled={b.isMain} onSelect={() => setToggling(b)}>
                    <Power /> {b.status === "active" ? (b.isMain ? "Main branch can’t be deactivated" : "Deactivate") : "Reactivate"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [money],
  );

  return (
    <>
      <PageHeader
        title="Branches"
        description="Your shop locations. Each branch has its own accounts, stock, tills and manager."
        actions={
          <Button asChild>
            <Link href="/branches/new">
              <Plus /> New branch
            </Link>
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active branches" icon={Building2} value={<span className="tabular-nums">{active}</span>} description={`${branches.length - active} inactive`} />
        <StatCard
          label="MTD revenue · all branches"
          value={<ConvertedMoney sum={all.revenue} currency={money.display} rate={money.rate} />}
          delta={prev.revenue.value ? ((all.revenue.value - prev.revenue.value) / prev.revenue.value) * 100 : null}
          deltaLabel="vs same days last month"
        />
        <StatCard label="MTD net · all branches" value={<span className={cn(all.net < 0 && "text-error-text")}>{formatMoney(all.net, money.display, { signed: true })}</span>} description={all.margin !== null ? `${all.margin.toFixed(1)}% margin` : "No revenue yet"} />
        <StatCard
          label="Branches without a manager"
          icon={UserPlus}
          value={<span className="tabular-nums">{withoutManager}</span>}
          description={withoutManager ? <Link href="/branch-managers/invite" className="font-medium text-primary hover:underline">Invite a manager</Link> : "Every branch is covered"}
        />
      </div>
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          searchPlaceholder="Search branches, codes, cities…"
          searchFn={(r, q) => [r.branch.name, r.branch.code, r.branch.city, r.managerName ?? ""].some((s) => s.toLowerCase().includes(q.toLowerCase()))}
          facets={[{ columnId: "status", label: "Status", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] }]}
          getRowId={(r) => r.branch.id}
          onRowClick={(r) => router.push(`/branches/${r.branch.id}`)}
          initialSorting={[{ id: "opened", desc: false }]}
          empty={
            <EmptyState
              icon={Building2}
              title="No branches found"
              description="Try a different search, or add a new branch."
              action={
                <Button asChild size="sm">
                  <Link href="/branches/new">
                    <Plus /> New branch
                  </Link>
                </Button>
              }
            />
          }
        />
      </Card>
      <ConversionNote converted={converted} excludedForeign={excluded} rate={money.rate} currency={money.display} className="mt-3" />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(undefined)}
        title={toggling?.status === "active" ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        description={
          toggling?.status === "active"
            ? "The branch will no longer appear in branch pickers for new transactions, sales or tills. Existing records stay in reports. You can reactivate it any time."
            : "The branch will be available again for new records."
        }
        confirmLabel={toggling?.status === "active" ? "Deactivate branch" : "Reactivate branch"}
        destructive={toggling?.status === "active"}
        onConfirm={() => setStatus.run(toggling!)}
      />
    </>
  );
}
