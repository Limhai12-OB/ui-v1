import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string;
  helper?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Labeled form field with helper text and inline error.
 * Pass `aria-invalid` and `aria-describedby={fieldDescribedBy(id)}` on the control.
 */
export function Field({ label, htmlFor, error, helper, required, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p id={htmlFor ? `${htmlFor}-helper` : undefined} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export function fieldDescribedBy(id: string, hasError: boolean) {
  return hasError ? `${id}-error` : `${id}-helper`;
}

/** Section within a long form. */
export function FormSection({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-6 border-b py-6 last:border-b-0 md:grid-cols-[220px_1fr]", className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
