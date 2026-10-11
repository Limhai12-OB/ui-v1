"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Lock, MoreHorizontal, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import type { Category, CategoryKind } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { categoryService } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CategoryFormDialog } from "./category-form-dialog";

const KIND_LABEL: Record<CategoryKind, string> = { income: "Income", expense: "Expense", item: "Item" };

export function CategoriesPage() {
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const items = useAppStore((s) => s.items);
  const canManage = useCan("categories.manage");
  const [tab, setTab] = useState<"all" | CategoryKind>("all");
  const [editing, setEditing] = useState<Category | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Category | undefined>();
  const remove = useAction((id: string) => categoryService.remove(id), { success: "Category deleted" });

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) if (t.categoryId) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    for (const i of items) m.set(i.categoryId, (m.get(i.categoryId) ?? 0) + 1);
    return m;
  }, [transactions, items]);

  const data = tab === "all" ? categories : categories.filter((c) => c.kind === tab);

  const columns = useMemo<ColumnDef<Category, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <SortHeader column={column} title="Name" />,
        meta: { label: "Name" },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.isSystem && (
              <Badge variant="neutral" title="System categories are used by automatic postings">
                <Lock /> System
              </Badge>
            )}
          </div>
        ),
      },
      { accessorKey: "nameKm", header: "Khmer name", cell: ({ getValue }) => <span lang="km">{(getValue() as string) || "—"}</span> },
      { accessorKey: "kind", header: "Type", cell: ({ getValue }) => <Badge variant="outline">{KIND_LABEL[getValue() as CategoryKind]}</Badge> },
      { accessorKey: "description", header: "Description", cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || "—"}</span> },
      {
        id: "usage",
        accessorFn: (c) => usage.get(c.id) ?? 0,
        header: ({ column }) => <SortHeader column={column} title="Records" align="right" />,
        meta: { align: "right", label: "Records" },
        cell: ({ getValue }) => (getValue() as number).toLocaleString("en-US"),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              enableHiding: false,
              header: () => <span className="sr-only">Actions</span>,
              meta: { align: "right" },
              cell: ({ row }) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(row.original);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" disabled={row.original.isSystem || (usage.get(row.original.id) ?? 0) > 0} onSelect={() => setDeleting(row.original)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            } satisfies ColumnDef<Category, unknown>,
          ]
        : []),
    ],
    [usage, canManage],
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description={canManage ? "Shared master data used to classify income, expenses and items in every branch." : "Shared master data maintained by the Business Owner. You can view categories but not change them."}
        actions={
          canManage && (
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus /> New category
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All ({categories.length})</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="expense">Expense</TabsTrigger>
          <TabsTrigger value="item">Item</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          searchPlaceholder="Search categories…"
          getRowId={(c) => c.id}
          initialSorting={[{ id: "name", desc: false }]}
          empty={<EmptyState icon={Tags} title="No categories" description="Create a category to start organizing records." />}
        />
      </Card>
      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Delete “${deleting?.name}”?`}
        description="This category isn't used by any records. Deleting it can't be undone."
        confirmLabel="Delete category"
        destructive
        onConfirm={() => remove.run(deleting!.id)}
      />
    </>
  );
}
