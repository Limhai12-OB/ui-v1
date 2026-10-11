"use client";

import { useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Search, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, TableSkeleton } from "@/components/shared/states";
import { cn } from "@/lib/utils";

export interface FacetFilter {
  columnId: string;
  label: string;
  options: { label: string; value: string }[];
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Text search across visible string columns (or `searchFn`). */
  searchPlaceholder?: string;
  searchFn?: (row: T, query: string) => boolean;
  facets?: FacetFilter[];
  /** Extra toolbar content (date filters, buttons) placed after facets. */
  toolbar?: React.ReactNode;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
  initialSorting?: SortingState;
  initialHidden?: string[];
  pageSize?: number;
  className?: string;
  /** Hide search/columns toolbar entirely (compact embedded tables). */
  bare?: boolean;
  /** Summary footer row. */
  footer?: React.ReactNode;
  /** Called with the rows remaining after search + facet filters (e.g. for summary strips). */
  onFilteredRowsChange?: (rows: T[]) => void;
}

const facetFilterFn: FilterFn<unknown> = (row, columnId, value: string) => {
  if (!value || value === "__all") return true;
  return String(row.getValue(columnId)) === value;
};

/**
 * Reusable data table built on TanStack Table:
 * search, facet filters, sorting, column visibility, pagination and row actions.
 * Column `meta.align = "right"` right-aligns numeric columns; `meta.label` names
 * columns with custom headers in the column-visibility menu.
 */
export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = "Search…",
  searchFn,
  facets = [],
  toolbar,
  onRowClick,
  getRowId,
  loading,
  empty,
  initialSorting = [],
  initialHidden = [],
  pageSize = 10,
  className,
  bare,
  footer,
  onFilteredRowsChange,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => Object.fromEntries(initialHidden.map((c) => [c, false])));
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters, columnVisibility, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getRowId: getRowId ? (r) => getRowId(r) : undefined,
    globalFilterFn: searchFn
      ? (row: Row<T>, _id, value: string) => searchFn(row.original, String(value).toLowerCase())
      : "includesString",
    filterFns: { facet: facetFilterFn as FilterFn<T> },
    defaultColumn: { filterFn: facetFilterFn as FilterFn<T> },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
  });

  const filteredModel = table.getFilteredRowModel();
  const filtered = filteredModel.rows.length;
  useEffect(() => {
    onFilteredRowsChange?.(filteredModel.rows.map((r) => r.original));
  }, [filteredModel, onFilteredRowsChange]);
  const activeFilters = columnFilters.length > 0 || globalFilter.length > 0;
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const columnLabel = (c: Column<T, unknown>) => (c.columnDef.meta as { label?: string } | undefined)?.label ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : undefined);
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && columnLabel(c));

  return (
    <div className={cn("flex flex-col", className)}>
      {!bare && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label={searchPlaceholder} />
          </div>
          {facets.map((f) => {
            const col = table.getColumn(f.columnId);
            if (!col) return null;
            const v = (col.getFilterValue() as string) ?? "__all";
            return (
              <Select key={f.columnId} value={v} onValueChange={(val) => col.setFilterValue(val === "__all" ? undefined : val)}>
                <SelectTrigger className={cn("min-w-36", v !== "__all" && "border-primary/50 bg-primary-light/40")} aria-label={`Filter by ${f.label}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All {f.label.toLowerCase()}</SelectItem>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })}
          {toolbar}
          {activeFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setGlobalFilter("");
                setColumnFilters([]);
              }}
            >
              <X /> Clear
            </Button>
          )}
          {hideable.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto">
                  <Columns3 /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideable.map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                    {columnLabel(c)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {loading ? (
        <TableSkeleton cols={Math.min(columns.length, 6)} />
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                  return (
                    <TableHead key={h.id} className={cn("h-10 bg-muted/40 px-3 text-xs font-medium text-muted-foreground first:pl-4 last:pr-4", align === "right" && "text-right")}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-0">
                  {activeFilters ? (
                    <EmptyState compact title="No matching records" description="Try a different search term or clear the filters." />
                  ) : (
                    (empty ?? <EmptyState compact title="Nothing here yet" />)
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" && e.target === e.currentTarget) onRowClick(row.original);
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(onRowClick && "cursor-pointer focus-visible:bg-muted focus-visible:outline-none")}
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align;
                    return (
                      <TableCell key={cell.id} className={cn("px-3 py-2.5 first:pl-4 last:pr-4", align === "right" && "text-right tabular-nums")}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
          {footer}
        </Table>
      )}

      {!loading && filtered > 0 && (pageCount > 1 || !bare) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {filtered === data.length ? `${filtered} records` : `${filtered} of ${data.length} records`}
          </span>
          <div className="flex items-center gap-2">
            <Select value={String(table.getState().pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger size="sm" className="w-[104px]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="tabular-nums">
              Page {pageIndex + 1} of {Math.max(1, pageCount)}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Clickable sortable column header. */
export function SortHeader<T>({ column, title, align }: { column: Column<T, unknown>; title: string; align?: "right" }) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        column.toggleSorting(sorted === "asc");
      }}
      className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", align === "right" && "flex-row-reverse")}
      aria-label={`Sort by ${title}`}
    >
      {title}
      {sorted === "asc" ? <ArrowUp className="size-3.5" /> : sorted === "desc" ? <ArrowDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-50" />}
    </button>
  );
}
