"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Ban, Copy, Eye, EyeOff, Info, Loader2, MoreHorizontal, Play, Repeat, Send, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import type { BranchManager } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useAction } from "@/hooks/use-action";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { managerService, userService } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/forms/field";
import { inviteDaysLeft } from "@/features/authentication/accept-invitation-page";

export function invitationLink(id: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/accept-invitation?invite=${id}`;
}

export async function copyInvitationLink(id: string) {
  try {
    await navigator.clipboard.writeText(invitationLink(id));
    toast.success("Invitation link copied");
  } catch {
    toast.error("Couldn’t copy the link", { description: "Your browser blocked clipboard access. Select and copy the link manually." });
  }
}

type Pending = { kind: "revoke" | "suspend" | "reactivate"; manager: BranchManager } | undefined;

export function ManagersPage() {
  const loading = useInitialLoad();
  const managers = useAppStore((s) => s.managers);
  const branches = useAppStore((s) => s.branches);
  const [pending, setPending] = useState<Pending>();
  const [reassigning, setReassigning] = useState<BranchManager | undefined>();
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "—";

  const resend = useAction((m: BranchManager) => managerService.resend(m.id), { success: "Invitation resent (simulated — no email is sent). It’s valid for 7 more days." });
  const revoke = useAction((m: BranchManager) => managerService.revoke(m.id), { success: "Invitation revoked — the link no longer works" });
  const setStatus = useAction(
    async (m: BranchManager, status: "active" | "suspended"): Promise<string> => {
      await managerService.update(m.id, { status });
      return status === "suspended" ? `${m.name} suspended` : `${m.name} reactivated`;
    },
    { success: (msg) => msg },
  );

  const columns = useMemo<ColumnDef<BranchManager, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <SortHeader column={column} title="Manager" />,
        meta: { label: "Manager" },
        cell: ({ row }) => (
          <div className="flex min-w-48 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary" aria-hidden>
              {row.original.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: "branch",
        accessorFn: (m) => m.branchId,
        header: "Branch",
        meta: { label: "Branch" },
        cell: ({ row }) => (
          <Link href={`/branches/${row.original.branchId}`} className="whitespace-nowrap hover:underline">
            {branchName(row.original.branchId)}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => {
          const m = row.original;
          const left = m.status === "invited" ? inviteDaysLeft(m.invitedAt) : null;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <StatusBadge status={m.status} />
              {left !== null && <span className={left < 0 ? "text-xs text-error-text" : "text-xs text-muted-foreground"}>{left < 0 ? "Invitation expired" : `Expires in ${left} day${left === 1 ? "" : "s"}`}</span>}
            </div>
          );
        },
      },
      {
        id: "invited",
        accessorFn: (m) => m.joinedAt ?? m.invitedAt,
        header: ({ column }) => <SortHeader column={column} title="Invited / joined" />,
        meta: { label: "Invited / joined" },
        cell: ({ row }) => (
          <div className="text-xs whitespace-nowrap tabular-nums">
            <p>Invited {formatDate(row.original.invitedAt)}</p>
            <p className="text-muted-foreground">{row.original.joinedAt ? `Joined ${formatDate(row.original.joinedAt)}` : "Not joined yet"}</p>
          </div>
        ),
      },
      {
        id: "lastActive",
        accessorFn: (m) => m.lastActiveAt ?? "",
        header: ({ column }) => <SortHeader column={column} title="Last active" />,
        meta: { label: "Last active" },
        cell: ({ row }) => <span className="text-xs whitespace-nowrap tabular-nums">{row.original.lastActiveAt ? formatDateTime(row.original.lastActiveAt) : "—"}</span>,
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: { align: "right" },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {m.status === "invited" && (
                  <>
                    <DropdownMenuItem onSelect={() => resend.fire(m)}>
                      <Send /> Resend invitation
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => copyInvitationLink(m.id)}>
                      <Copy /> Copy invitation link
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onSelect={() => setReassigning(m)}>
                  <Repeat /> Reassign branch
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {m.status === "invited" && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: "revoke", manager: m })}>
                    <Trash2 /> Revoke invitation
                  </DropdownMenuItem>
                )}
                {m.status === "active" && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: "suspend", manager: m })}>
                    <Ban /> Suspend access
                  </DropdownMenuItem>
                )}
                {m.status === "suspended" && (
                  <DropdownMenuItem onSelect={() => setPending({ kind: "reactivate", manager: m })}>
                    <Play /> Reactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, resend.fire],
  );

  const counts = { active: managers.filter((m) => m.status === "active").length, invited: managers.filter((m) => m.status === "invited").length, suspended: managers.filter((m) => m.status === "suspended").length };

  const confirmCopy = pending && {
    revoke: { title: `Revoke ${pending.manager.name}’s invitation?`, description: `The invitation link will stop working and ${branchName(pending.manager.branchId)} will have no manager. You can invite someone again later.`, label: "Revoke invitation", destructive: true },
    suspend: { title: `Suspend ${pending.manager.name}?`, description: `They won’t be able to sign in or work in ${branchName(pending.manager.branchId)} until you reactivate them. Their records stay in place.`, label: "Suspend access", destructive: true },
    reactivate: { title: `Reactivate ${pending.manager.name}?`, description: `They’ll be able to sign in and work in ${branchName(pending.manager.branchId)} again.`, label: "Reactivate", destructive: false },
  }[pending.kind];

  return (
    <>
      <PageHeader
        title="Branch managers"
        description="People who run a single branch day to day. Invite, reassign or suspend them here."
        actions={
          <Button asChild>
            <Link href="/branch-managers/invite">
              <UserPlus /> Invite manager
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 gap-0 py-0">
          <DataTable
            columns={columns}
            data={managers}
            loading={loading}
            searchPlaceholder="Search by name or email…"
            searchFn={(m, q) => [m.name, m.email, branchName(m.branchId)].some((s) => s.toLowerCase().includes(q))}
            facets={[
              { columnId: "status", label: "Status", options: [{ label: "Active", value: "active" }, { label: "Invited", value: "invited" }, { label: "Suspended", value: "suspended" }] },
              { columnId: "branch", label: "Branch", options: branches.map((b) => ({ label: b.name, value: b.id })) },
            ]}
            getRowId={(m) => m.id}
            initialSorting={[{ id: "name", desc: false }]}
            empty={
              <EmptyState
                icon={Users}
                title={managers.length ? "No managers match" : "No branch managers yet"}
                description={managers.length ? "Try a different search or filter." : "Invite a manager to run one of your branches."}
                action={
                  !managers.length && (
                    <Button asChild size="sm">
                      <Link href="/branch-managers/invite">
                        <UserPlus /> Invite manager
                      </Link>
                    </Button>
                  )
                }
              />
            }
          />
        </Card>
        <div className="grid content-start gap-6">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 text-primary" aria-hidden /> What branch managers can do
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="space-y-2">
                <li className="flex gap-2">
                  <Eye className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                  <span>Work only in their assigned branch: sales, stock, tills, bills, transactions and reconciliations.</span>
                </li>
                <li className="flex gap-2">
                  <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>Can’t see other branches’ financial records or the consolidated business.</span>
                </li>
                <li className="flex gap-2">
                  <Ban className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>Can’t manage branches, invite managers, change business settings or sign off their own tills and reconciliations.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-sm">Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ["Active", counts.active],
                    ["Invited", counts.invited],
                    ["Suspended", counts.suspended],
                  ] as const
                ).map(([l, n]) => (
                  <div key={l} className="rounded-lg bg-muted/50 p-2">
                    <dt className="text-xs text-muted-foreground">{l}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{n}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Invitations are simulated in the demo — no emails are sent. Copy the link to open it yourself.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(undefined)}
        title={confirmCopy?.title ?? ""}
        description={confirmCopy?.description}
        confirmLabel={confirmCopy?.label}
        destructive={confirmCopy?.destructive}
        onConfirm={() => {
          const p = pending!;
          if (p.kind === "revoke") return revoke.run(p.manager);
          return setStatus.run(p.manager, p.kind === "suspend" ? "suspended" : "active");
        }}
      />
      <ReassignDialog manager={reassigning} onOpenChange={(o) => !o && setReassigning(undefined)} />
    </>
  );
}

function ReassignDialog({ manager, onOpenChange }: { manager?: BranchManager; onOpenChange: (o: boolean) => void }) {
  const branches = useAppStore((s) => s.branches);
  const managers = useAppStore((s) => s.managers);
  const users = useAppStore((s) => s.users);
  const [target, setTarget] = useState<string>("");
  const [lastId, setLastId] = useState<string | undefined>();
  if (manager?.id !== lastId) {
    setLastId(manager?.id);
    setTarget("");
  }

  const options = branches.map((b) => {
    const holder = managers.find((m) => m.branchId === b.id && m.id !== manager?.id);
    return { branch: b, holder, disabled: b.id === manager?.branchId || !!holder || b.status !== "active" };
  });

  const save = useAction(
    async (m: BranchManager, branchId: string): Promise<string> => {
      await managerService.update(m.id, { branchId });
      const user = users.find((u) => u.email.toLowerCase() === m.email.toLowerCase());
      if (user) await userService.update(user.id, { branchId });
      return `${m.name} now manages ${branches.find((b) => b.id === branchId)?.name}`;
    },
    { success: (msg) => msg, onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={!!manager} onOpenChange={(o) => !save.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign {manager?.name}</DialogTitle>
          <DialogDescription>
            Move this manager to another branch. They’ll lose access to {branches.find((b) => b.id === manager?.branchId)?.name} immediately and see only the new branch.
          </DialogDescription>
        </DialogHeader>
        <Field label="New branch" htmlFor="reassign-branch" required helper="Branches that already have a manager or are inactive can’t be selected.">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="reassign-branch" className="w-full">
              <SelectValue placeholder="Select a branch" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.branch.id} value={o.branch.id} disabled={o.disabled}>
                  {o.branch.name}
                  {o.branch.id === manager?.branchId ? " (current)" : o.holder ? ` (${o.holder.name})` : o.branch.status !== "active" ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.pending}>
            Cancel
          </Button>
          <Button disabled={!target || save.pending} onClick={() => manager && save.fire(manager, target)}>
            {save.pending && <Loader2 className="animate-spin" />}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
