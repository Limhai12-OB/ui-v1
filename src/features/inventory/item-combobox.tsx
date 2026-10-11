"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { ID, Item } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Searchable item picker (SKU, English or Khmer name). */
export function ItemCombobox({
  id,
  items,
  value,
  onChange,
  renderMeta,
  invalid,
  placeholder = "Search items by SKU or name…",
}: {
  id?: string;
  items: Item[];
  value?: ID;
  onChange: (id: ID) => void;
  renderMeta?: (item: Item) => React.ReactNode;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className={cn("h-auto min-h-9 w-full justify-between bg-card px-3 py-1.5 text-left font-normal", invalid && "border-destructive")}
        >
          {selected ? (
            <span className="min-w-0 truncate">
              <span className="font-mono text-xs text-muted-foreground">{selected.sku}</span> <span className="font-medium">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select an item</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No items match.</CommandEmpty>
            <CommandGroup>
              {items.map((i) => (
                <CommandItem
                  key={i.id}
                  value={`${i.sku} ${i.name} ${i.nameKm ?? ""}`}
                  onSelect={() => {
                    onChange(i.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === i.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <span className="font-mono text-xs text-muted-foreground">{i.sku}</span> {i.name}
                    </span>
                    {renderMeta && <span className="block text-xs text-muted-foreground">{renderMeta(i)}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
