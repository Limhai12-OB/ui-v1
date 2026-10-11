"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { Category } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { categoryService } from "@/lib/api";
import { useAction } from "@/hooks/use-action";

const schema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(40, "Keep it under 40 characters"),
  nameKm: z.string().trim().max(40).optional(),
  kind: z.enum(["income", "expense", "item"]),
  description: z.string().trim().max(120).optional(),
});
type FormValues = z.infer<typeof schema>;

export function CategoryFormDialog({ open, onOpenChange, category }: { open: boolean; onOpenChange: (o: boolean) => void; category?: Category }) {
  const editing = !!category;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { name: "", nameKm: "", kind: "expense", description: "" },
  });
  const { register, handleSubmit, control, reset, formState } = form;

  useEffect(() => {
    if (open) reset(category ? { name: category.name, nameKm: category.nameKm ?? "", kind: category.kind, description: category.description ?? "" } : { name: "", nameKm: "", kind: "expense", description: "" });
  }, [open, category, reset]);

  const save = useAction(async (v: FormValues): Promise<void> => {
    if (editing) await categoryService.update(category!.id, v);
    else await categoryService.create(v);
  }, {
    success: editing ? "Category updated" : "Category created",
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !save.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit((v) => save.fire(v))} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>Categories organize transactions, bills and items across all branches.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Field label="Name" htmlFor="cat-name" required error={formState.errors.name?.message}>
              <Input id="cat-name" autoFocus {...register("name")} aria-invalid={!!formState.errors.name} />
            </Field>
            <Field label="Khmer name" htmlFor="cat-km" helper="Optional — shown when the interface language is Khmer.">
              <Input id="cat-km" lang="km" {...register("nameKm")} />
            </Field>
            <Field label="Type" htmlFor="cat-kind" required>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={editing && category?.isSystem}>
                    <SelectTrigger id="cat-kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="item">Item category</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Description" htmlFor="cat-desc">
              <Textarea id="cat-desc" rows={2} {...register("description")} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || save.pending || (editing && !formState.isDirty)}>
              {save.pending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
