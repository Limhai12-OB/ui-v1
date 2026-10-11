import { cn } from "@/lib/utils";

export interface DetailItem {
  label: string;
  value: React.ReactNode;
  className?: string;
}

/** Label/value pairs for detail panels. */
export function DetailList({ items, columns = 2, className }: { items: DetailItem[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((it) => (
        <div key={it.label} className={cn("min-w-0", it.className)}>
          <dt className="text-xs font-medium text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-foreground">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
