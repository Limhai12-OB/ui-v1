"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Mic, MicOff, RotateCcw, Sparkles, Square, Wand2 } from "lucide-react";
import type { Language } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { invoiceService } from "@/lib/api";
import { delay, LATENCY } from "@/lib/api/mock";
import { addDaysISO, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { DemoNotice, AIBadge } from "@/components/shared/demo-notice";
import { Steps } from "@/components/shared/steps";
import { Field } from "@/components/forms/field";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { InvoiceForm, invoiceDefaults, toNewInvoice, type InvoiceFormValues } from "../invoice-form";
import { emptyLine, itemPrice } from "@/features/sales-shared/lines";
import { extractInvoice, VOICE_SAMPLES, type Extraction } from "./parser";

type Phase = "idle" | "recording" | "transcribing" | "ready" | "extracting" | "review";

const STEPS = [
  { id: "record", label: "Record" },
  { id: "transcript", label: "Review transcript" },
  { id: "extract", label: "AI extraction" },
  { id: "invoice", label: "Confirm invoice" },
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function ConfidenceChip({ value }: { value: number }) {
  const tone = value >= 0.85 ? "bg-success-light text-success-text" : value >= 0.7 ? "bg-warning-light text-warning-text" : "bg-error-light text-error-text";
  const label = value >= 0.85 ? "High" : value >= 0.7 ? "Check" : "Low";
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums", tone)}>
      {label} · {pct(value)}
    </span>
  );
}

export function VoiceInvoicePage() {
  const router = useRouter();
  const customers = useAppStore((s) => s.customers);
  const items = useAppStore((s) => s.items);
  const rate = useAppStore((s) => s.business.khrPerUsd);
  const { branch, branches, inScope } = useScope();
  const { itemName, customerName } = useLookups();

  const [language, setLanguage] = useState<Language>("en");
  const samples = VOICE_SAMPLES.filter((s) => s.language === language);
  const [sampleId, setSampleId] = useState(samples[0].id);
  const sample = VOICE_SAMPLES.find((s) => s.id === sampleId) ?? samples[0];

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [formKey, setFormKey] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Customers the user may invoice (managers: own branch only).
  const allowedCustomers = useMemo(() => customers.filter((c) => c.type === "wholesale" && inScope(c.branchId)), [customers, inScope]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const changeLanguage = (l: Language) => {
    setLanguage(l);
    setSampleId(VOICE_SAMPLES.find((s) => s.language === l)!.id);
  };

  const stopRecording = async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPhase("transcribing");
    await delay(LATENCY.slow);
    setTranscript(sample.transcript);
    setPhase("ready");
  };

  const startRecording = () => {
    setElapsed(0);
    setExtraction(null);
    setPhase("recording");
    timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  // The simulated sample "recording" ends on its own after its length.
  useEffect(() => {
    if (phase === "recording" && elapsed >= sample.seconds) void stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, elapsed, sample.seconds]);

  const runExtraction = async () => {
    setPhase("extracting");
    await delay(LATENCY.ai);
    const result = extractInvoice(transcript, allowedCustomers, items, language);
    setExtraction(result);
    setFormKey((k) => k + 1);
    setPhase("review");
  };

  const reset = () => {
    if (timer.current) clearInterval(timer.current);
    setPhase("idle");
    setElapsed(0);
    setTranscript("");
    setExtraction(null);
  };

  const defaults = useMemo<InvoiceFormValues | null>(() => {
    if (!extraction) return null;
    const customer = allowedCustomers.find((c) => c.id === extraction.customerId);
    const fallbackBranch = branch?.id ?? (branches.length === 1 ? branches[0].id : undefined);
    const base = invoiceDefaults({ customerId: customer?.id, branchId: customer?.branchId ?? fallbackBranch, terms: customer?.paymentTermsDays });
    if (extraction.dueInDays) base.dueDate = addDaysISO(today(), extraction.dueInDays);
    const lines = extraction.lines.map((l) => {
      const item = items.find((i) => i.id === l.itemId)!;
      return { itemId: item.id, description: item.name, quantity: l.quantity ?? 1, unitPrice: itemPrice(item, base.currency, rate) ?? 0 };
    });
    base.lines = lines.length ? lines : [emptyLine()];
    base.notes = `Created with Voice-to-Invoice from ${language === "km" ? "a Khmer" : "an English"} transcript.`;
    return base;
    // formKey forces fresh defaults for each extraction run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraction, formKey]);

  const submit = async (v: InvoiceFormValues, send: boolean) => {
    try {
      const inv = await invoiceService.create(toNewInvoice(v, { send, source: "voice" }));
      toast.success(send ? `${inv.number} created and sent` : `${inv.number} saved as draft`, send ? { description: "Stock for item lines was deducted from the branch." } : undefined);
      router.push(`/invoices/${inv.id}`);
    } catch (e) {
      toast.error("Couldn't create invoice", { description: e instanceof Error ? e.message : undefined });
      throw e;
    }
  };

  const step = phase === "idle" || phase === "recording" || phase === "transcribing" ? 0 : phase === "ready" ? 1 : phase === "extracting" ? 2 : 3;
  const busy = phase === "recording" || phase === "transcribing" || phase === "extracting";

  return (
    <>
      <PageHeader
        backHref="/invoices"
        backLabel="Invoices"
        title="Voice-to-Invoice"
        description="Describe an order out loud in Khmer or English, review the transcript and the extracted lines, then save a draft or create the invoice."
      />

      <Steps steps={STEPS} current={step} className="mb-5" />

      <DemoNotice className="mb-5">
        <strong className="font-medium">Simulated in the demo.</strong> The microphone is not connected and no audio is recorded or sent anywhere. Pressing record plays back
        the selected sample recording, and extraction uses a local rule-based parser in place of the AI service.
      </DemoNotice>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* Capture */}
        <Card className="h-fit gap-5 p-5 2xl:sticky 2xl:top-20">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
            <Field label="Language" htmlFor="voice-lang">
              <ToggleGroup id="voice-lang" type="single" variant="outline" value={language} onValueChange={(v) => v && changeLanguage(v as Language)} disabled={busy} className="w-full">
                <ToggleGroupItem value="en" className="flex-1 data-[state=on]:bg-primary-light data-[state=on]:text-primary">
                  English
                </ToggleGroupItem>
                <ToggleGroupItem value="km" lang="km" className="flex-1 data-[state=on]:bg-primary-light data-[state=on]:text-primary">
                  ខ្មែរ
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field label="Sample recording" htmlFor="voice-sample" helper="Stands in for the microphone in the demo.">
              <Select value={sampleId} onValueChange={setSampleId} disabled={busy}>
                <SelectTrigger id="voice-sample" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {samples.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center">
            <button
              type="button"
              onClick={phase === "recording" ? () => void stopRecording() : startRecording}
              disabled={phase === "transcribing" || phase === "extracting"}
              aria-label={phase === "recording" ? "Stop simulated recording" : "Start simulated recording"}
              aria-pressed={phase === "recording"}
              className={cn(
                "relative flex size-20 items-center justify-center rounded-full text-white shadow-sm transition-colors focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50",
                phase === "recording" ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary-hover",
              )}
            >
              {phase === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40 motion-reduce:hidden" aria-hidden />}
              {phase === "recording" ? <Square className="relative size-7 fill-current" /> : phase === "transcribing" ? <Loader2 className="size-8 animate-spin" /> : <Mic className="size-8" />}
            </button>
            <div role="status" aria-live="polite" className="space-y-0.5">
              {phase === "recording" ? (
                <>
                  <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-destructive">
                    <span className="size-2 rounded-full bg-destructive" aria-hidden /> Recording (simulated)
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">{mmss(elapsed)}</p>
                  <p className="text-xs text-muted-foreground">Playing sample · {mmss(sample.seconds)}</p>
                </>
              ) : phase === "transcribing" ? (
                <p className="text-sm text-muted-foreground">Transcribing sample recording…</p>
              ) : (
                <>
                  <p className="text-sm font-medium">{transcript ? "Record again" : "Tap to record"}</p>
                  <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <MicOff className="size-3.5" aria-hidden /> Microphone not connected in demo
                  </p>
                </>
              )}
            </div>
          </div>

          <Field label="Transcript" htmlFor="voice-transcript" helper="Edit the text to fix anything the speech recognition got wrong, then extract.">
            <Textarea
              id="voice-transcript"
              rows={5}
              lang={language}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="The transcript appears here after recording. You can also type or paste an order."
              disabled={busy}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runExtraction} disabled={busy || transcript.trim().length < 5} className="flex-1">
              {phase === "extracting" ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {phase === "review" ? "Extract again" : "Extract invoice"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={busy || (!transcript && !extraction)}>
              <RotateCcw /> Start over
            </Button>
          </div>
        </Card>

        {/* Extraction + invoice */}
        <div className="min-w-0 space-y-6">
          {phase === "extracting" && (
            <Card className="items-center gap-2 p-10 text-center" role="status" aria-live="polite">
              <Loader2 className="size-6 animate-spin text-ai" aria-hidden />
              <p className="text-sm font-medium">Extracting customer, items and due date…</p>
              <p className="text-xs text-muted-foreground">Simulated AI extraction</p>
            </Card>
          )}

          {phase !== "extracting" && !extraction && (
            <Card className="items-center gap-2 p-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-ai-light text-ai-text">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <p className="text-sm font-medium">No extraction yet</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">Record a sample or type an order, then choose “Extract invoice”. You&apos;ll review every field before anything is saved.</p>
            </Card>
          )}

          {phase === "review" && extraction && defaults && (
            <InvoiceForm
              key={formKey}
              defaultValues={defaults}
              onSubmit={submit}
              onCancel={() => router.push("/invoices")}
              sendLabel="Create invoice"
              startDirty
              beforeLines={
                <Card className="gap-4 border-ai/25 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-medium">Extraction preview</h2>
                      <AIBadge label="Simulated AI extraction" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Overall confidence <ConfidenceChip value={extraction.overall} />
                    </span>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <dt className="text-xs text-muted-foreground">Customer</dt>
                      <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium">
                        {extraction.customerId ? customerName(extraction.customerId) : <span className="text-error-text">Not recognized</span>}
                        {extraction.customerId && <ConfidenceChip value={extraction.customerConfidence} />}
                      </dd>
                      {extraction.customerPhrase && <p className="mt-1 text-xs text-muted-foreground">Heard “{extraction.customerPhrase}”</p>}
                    </div>
                    <div className="rounded-lg border p-3">
                      <dt className="text-xs text-muted-foreground">Due</dt>
                      <dd className="mt-1 font-medium">{extraction.dueInDays ? `In ${extraction.dueInDays} days` : "Not mentioned — customer terms used"}</dd>
                    </div>
                  </dl>

                  {extraction.lines.length > 0 && (
                    <ul className="divide-y rounded-lg border text-sm">
                      {extraction.lines.map((l) => (
                        <li key={l.itemId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <span className="min-w-0">
                            <span className="font-medium">{itemName(l.itemId)}</span>
                            <span className="ml-2 text-xs text-muted-foreground">heard “{l.phrase}”</span>
                          </span>
                          <span className="flex items-center gap-2 tabular-nums">
                            <span className="text-xs text-muted-foreground">Qty {l.quantity ?? "?"}</span>
                            <ConfidenceChip value={Math.min(l.itemConfidence, l.quantityConfidence)} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {extraction.warnings.length > 0 ? (
                    <div role="alert" className="space-y-1.5 rounded-lg border border-warning/30 bg-warning-light p-3 text-sm text-warning-text">
                      <p className="flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="size-4" aria-hidden /> Review {extraction.warnings.length} {extraction.warnings.length === 1 ? "issue" : "issues"} before saving
                      </p>
                      <ul className="list-disc space-y-0.5 pl-6 text-xs">
                        {extraction.warnings.map((w, i) => (
                          <li key={i}>
                            {w.kind === "customer_not_found" && <>Customer {w.phrase ? `“${w.phrase}” ` : ""}wasn&apos;t found among your wholesale customers — select one below.</>}
                            {w.kind === "unknown_item" && <>“{w.phrase}” doesn&apos;t match any stock item — add it as a line manually if needed.</>}
                            {w.kind === "missing_quantity" && <>No quantity heard for {itemName(w.itemId)} — it was set to 1, please check.</>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm text-success-text">
                      <CheckCircle2 className="size-4" aria-hidden /> Every phrase was matched. Check prices and stock below before saving.
                    </p>
                  )}
                </Card>
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
