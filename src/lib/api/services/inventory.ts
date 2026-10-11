import type { ID, Item, StockAdjustment } from "@/types";
import type { NewAdjustment, NewItem } from "@/store/app-store";
import { isMock } from "../config";
import { coreApi } from "../http";
import { LATENCY, mockError, simulate } from "../mock";
import { db } from "./_store";

export const itemService = {
  create: (i: NewItem) =>
    isMock
      ? simulate<Item>(() => {
          if (db().items.some((x) => x.sku.toLowerCase() === i.sku.toLowerCase())) mockError(`SKU ${i.sku} is already in use.`, 409, "DUPLICATE");
          return db().createItem(i);
        })
      : coreApi.post<Item>("/items", i),
  update: (id: ID, patch: Partial<Omit<Item, "stock">>) =>
    isMock
      ? simulate(() => {
          if (patch.sku && db().items.some((x) => x.id !== id && x.sku.toLowerCase() === patch.sku!.toLowerCase())) mockError(`SKU ${patch.sku} is already in use.`, 409, "DUPLICATE");
          db().updateItem(id, patch);
        })
      : coreApi.patch<void>(`/items/${id}`, patch),
  bulkImport: (rows: NewItem[]) => (isMock ? simulate<Item[]>(() => db().bulkImportItems(rows), LATENCY.slow) : coreApi.post<Item[]>("/items/bulk", rows)),
};

export const stockService = {
  adjust: (a: NewAdjustment) =>
    isMock
      ? simulate<StockAdjustment>(() => {
          const item = db().items.find((i) => i.id === a.itemId);
          if (!item) mockError("Item not found.", 404, "NOT_FOUND");
          const cur = item.stock[a.branchId] ?? 0;
          if (a.quantity < 0) mockError("Quantity cannot be negative.");
          if (a.type === "decrease" && a.quantity > cur) mockError(`Cannot remove ${a.quantity}; only ${cur} on hand.`);
          if (a.type !== "correction" && a.quantity === 0) mockError("Quantity must be greater than zero.");
          return db().createStockAdjustment(a);
        })
      : coreApi.post<StockAdjustment>("/stock-adjustments", a),
};
