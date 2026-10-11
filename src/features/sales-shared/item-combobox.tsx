"use client";

import { useState } from "react";
import { ChevronsUpDown, PenLine, Package } from "lucide-react";
import type { Currency, ID, Item } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { itemPrice } from "./lines";

interface ItemComboboxProps {
  id?: string;
  items: Item[];
  value?: ID;
  branchId?: ID;
  currency: Currency;
  rate: number | null;
  onSelect: (item: Item | undefined) => void;
  invalid?: boolean;
}

/** Searchable item picker (name, Khmer name or SKU) showing stock at the document branch. */
export function ItemCombobox({ id, items, value, branchId, currency, rate, onSelect, invalid }: ItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? items.find((i) => i.id === value) : undefined;
  const active = items.filter((i) => i.status === "active");

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
          className={cn("w-full justify-between px-2.5 font-normal", !selected && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {selected ? <Package className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <PenLine className="size-3.5 shrink-0" aria-hidden />}
            <span className="truncate">{selected ? selected.sku : "Free text"}</span>
          </span>
          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,380px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name, Khmer name or SKU…" />
          <CommandList>
            <CommandEmpty>No items match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__free free text custom line"
                onSelect={() => {
                  onSelect(undefined);
                  setOpen(false);
                }}
              >
                <PenLine aria-hidden />
                <span>Free-text line (not a stock item)</span>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Items">
              {active.map((it) => {
                const stock = branchId ? (it.stock[branchId] ?? 0) : undefined;
                const price = itemPrice(it, currency, rate);
                return (
                  <CommandItem
                    key={it.id}
                    value={`${it.name} ${it.sku} ${it.nameKm ?? ""} ${it.id}`}
                    onSelect={() => {
                      onSelect(it);
                      setOpen(false);
                    }}
                    data-checked={it.id === value}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{it.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {it.sku}
                        {it.nameKm && <span lang="km"> · {it.nameKm}</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p>{price !== null ? formatMoney(price, currency) : formatMoney(it.sellingPrice, it.currency)}</p>
                      {stock !== undefined && (
                        <p className={cn(stock <= 0 ? "text-error-text" : stock <= it.reorderLevel ? "text-warning-text" : "text-muted-foreground")}>
                          {stock} {it.unit} in stock
                        </p>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
