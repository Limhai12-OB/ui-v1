"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Info, Loader2, ShieldCheck } from "lucide-react";
import type { ID } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { importService } from "@/lib/api";
import { accountBalance } from "@/lib/domain";
import { formatDateTime } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { Steps, type StepDef } from "@/components/shared/steps";
import { DemoNotice } from "@/components/shared/demo-notice";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { AccountSelect } from "@/components/forms/entity-selects";
import { Field } from "@/components/forms/field";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BankingNav } from "../banking-nav";
import { LOW_CONFIDENCE } from "../categorize";
import { readFileText } from "@/features/import/components/dropzone";
import { autoMapping, mappingProblems, parseStatementText, StatementParseError, type ColumnMapping, type ParsedStatement } from "./formats";
import { STATEMENT_SAMPLES, type StatementSample } from "./samples";
import { mapRows, reviewRows, summarize, type RowOverride } from "./rows";
import { UploadStep, type UploadProblem } from "./upload-step";
import { MappingStep } from "./mapping-step";
import { CategorizeStep, DuplicatesStep } from "./review-steps";
import { ConfirmStep, ResultStep, type CommitResult } from "./confirm-result";

const STEPS: StepDef[] = [
  { id: "upload", label: "Upload" },
  { id: "account", label: "Account" },
  { id: "map", label: "Map fields" },
  { id: "categorize", label: "Categories" },
  { id: "duplicates", label: "Duplicates & errors" },
  { id: "confirm", label: "Confirm" },
  { id: "results", label: "Results" },
];

const STEP_HELP = [
  "Upload a CSV or Excel export from your bank, or pick a built-in sample.",
  "Choose the financial account this statement belongs to.",
  "Check how the file's columns map to transaction fields.",
  "Review the AI category suggestions. Confirmed rows post directly; the rest go to review.",
  "Duplicates are excluded by default. Fix or skip rows with missing information.",
  "Check the summary and confirm. Nothing is posted until you do.",
  "Your import results.",
];

const MAX_BYTES = 5 * 1024 * 1024;

export function StatementImportPage() {
  const params = useSearchParams();
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const customers = useAppStore((s) => s.customers);
  const imports = useAppStore((s) => s.imports);
  const { inScope, branch, branches, user } = useScope();
  const { accountName } = useLookups();

  const retryBatch = useMemo(() => imports.find((b) => b.id === params.get("retry")), [imports, params]);
  const presetAccount = params.get("account") ?? retryBatch?.accountId ?? undefined;

  const [step, setStep] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedStatement>();
  const [problem, setProblem] = useState<UploadProblem>();
  const [lastSource, setLastSource] = useState<{ text: string; fileName: string; fileSize: number; sample?: StatementSample }>();
  const [accountId, setAccountId] = useState<ID | undefined>();
  const [mapping, setMapping] = useState<ColumnMapping>();
  const [overrides, setOverrides] = useState<Record<number, RowOverride>>({});
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult] = useState<CommitResult>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const scopedAccount = (id?: ID) => {
    const a = accounts.find((x) => x.id === id);
    return a && a.status === "active" && inScope(a.branchId) ? a : undefined;
  };

  useEffect(() => {
    if (presetAccount && !accountId && scopedAccount(presetAccount)) setAccountId(presetAccount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetAccount]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const account = scopedAccount(accountId);
  const fallbackBranch = branch?.id ?? user.branchId ?? branches[0]?.id;

  /* ---------------- parsing ---------------- */

  const handleText = useCallback(
    async (text: string, fileName: string, fileSize: number, sample?: StatementSample) => {
      setParsing(true);
      setProblem(undefined);
      setParsed(undefined);
      setLastSource({ text, fileName, fileSize, sample });
      await new Promise((r) => setTimeout(r, 450)); // visible parsing state
      try {
        const p = parseStatementText(text, fileName, fileSize, sample ? { currency: sample.currency, sampleId: sample.id } : undefined);
        setParsed(p);
        setMapping(autoMapping(p));
        setOverrides({});
        setAck(false);
        // Suggest the matching account when nothing was preset
        if (!accountId || !scopedAccount(accountId)) {
          const suggested = sample ? scopedAccount(sample.suggestedAccountId) : accounts.find((a) => a.status === "active" && inScope(a.branchId) && p.format.bank && a.provider === p.format.bank);
          if (suggested) setAccountId(suggested.id);
        }
      } catch (e) {
        const message = e instanceof StatementParseError ? e.message : "The file couldn't be read.";
        const acc = scopedAccount(accountId) ?? (sample ? scopedAccount(sample.suggestedAccountId) : undefined);
        try {
          const batch = await importService.createBatch({
            kind: "bank_statement",
            fileName,
            fileSize,
            bank: sample?.bank ?? acc?.provider,
            accountId: acc?.id,
            branchId: acc?.branchId ?? fallbackBranch,
            status: "failed",
            totalRows: 0,
            importedRows: 0,
            duplicateRows: 0,
            errorRows: 0,
            reviewRows: 0,
            errorMessage: message,
          });
          setProblem({ kind: "failed", message, fileName, batchId: batch.id });
        } catch {
          setProblem({ kind: "failed", message, fileName });
        }
      } finally {
        setParsing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, accountId, inScope, fallbackBranch],
  );

  const onFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    setParsed(undefined);
    if (ext === "xlsx" || ext === "xls") {
      setProblem({
        kind: "excel",
        fileName: file.name,
        message: "Excel workbooks are converted by the LedgerVision import service, which isn't connected in this demo — nothing was uploaded. Export the statement as CSV, or try the “Wing Business export (Excel sample)” on the right.",
      });
      return;
    }
    if (ext !== "csv" && file.type !== "text/csv") {
      setProblem({ kind: "invalid", fileName: file.name, message: "Only CSV and Excel statement exports are supported. Scanned PDFs and images can't be imported as statements." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem({ kind: "invalid", fileName: file.name, message: "The file is larger than 5 MB. Export a shorter period and try again." });
      return;
    }
    try {
      const text = await readFileText(file);
      await handleText(text, file.name, file.size);
    } catch {
      setProblem({ kind: "invalid", fileName: file.name, message: "The file couldn't be read by the browser." });
    }
  };

  const onSample = (s: StatementSample) => {
    const text = s.build();
    void handleText(text, s.fileName, new Blob([text]).size, s);
  };

  useEffect(() => {
    const sid = params.get("sample");
    const s = STATEMENT_SAMPLES.find((x) => x.id === sid);
    if (s && s.id !== "corrupted") onSample(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- derived rows ---------------- */

  const mapped = useMemo(() => (parsed && mapping ? mapRows(parsed, mapping) : []), [parsed, mapping]);
  const customerNames = useMemo(() => customers.map((c) => c.name), [customers]);
  const reviewed = useMemo(() => (account ? reviewRows(mapped, { account, transactions, customers: customerNames, overrides }) : []), [mapped, account, transactions, customerNames, overrides]);
  const summary = useMemo(() => summarize(reviewed, account?.currency ?? "USD"), [reviewed, account]);

  const setOverride = (line: number, patch: Partial<RowOverride> | null) =>
    setOverrides((o) => {
      const next = { ...o };
      if (patch === null) delete next[line];
      else next[line] = { ...next[line], ...patch };
      return next;
    });

  const acceptAll = (includeLow: boolean) => {
    setOverrides((o) => {
      const next = { ...o };
      for (const r of reviewed) {
        if (r.errors.length || !r.suggestion || r.categoryId) continue;
        if (!includeLow && r.suggestion.confidence < LOW_CONFIDENCE) continue;
        next[r.line] = { ...next[r.line], categoryId: r.suggestion.categoryId };
      }
      return next;
    });
  };

  /* ---------------- step validation ---------------- */

  const providerMismatch = !!(account && parsed?.format.bank && account.provider !== parsed.format.bank);
  const currencyMismatch = !!(account && parsed?.currency && account.currency !== parsed.currency);
  const canNext = [
    !!parsed && !parsing,
    !!account && !currencyMismatch,
    !!mapping && mappingProblems(mapping).length === 0 && mapped.length > 0,
    true,
    true,
    ack,
  ][step];

  /* ---------------- commit ---------------- */

  const commit = async () => {
    if (!account || !parsed) return;
    const snapshot = summary;
    const rows = reviewed
      .filter((r) => r.willPost)
      .map((r) => ({
        date: r.date!,
        description: r.description,
        amount: r.amount!,
        reference: r.reference,
        categoryId: r.categoryId,
        suggestedCategoryId: r.suggestion?.categoryId,
        suggestionConfidence: r.suggestion?.confidence,
      }));
    setStep(6);
    setPhase("processing");
    setResult({ batchId: "", summary: snapshot, accountId: account.id });
    let batchId: ID | undefined;
    try {
      const batch = await importService.createBatch({
        kind: "bank_statement",
        fileName: parsed.fileName,
        fileSize: parsed.fileSize,
        bank: account.provider === "Cash" ? undefined : account.provider,
        accountId: account.id,
        branchId: account.branchId,
        status: "processing",
        totalRows: snapshot.total,
        importedRows: 0,
        duplicateRows: snapshot.duplicates,
        errorRows: snapshot.errors + snapshot.skipped,
        reviewRows: 0,
      });
      batchId = batch.id;
      setResult({ batchId: batch.id, summary: snapshot, accountId: account.id });
      await importService.commitStatementRows(batch.id, account.id, rows);
      setPhase("done");
      toast.success(snapshot.toPost ? `${snapshot.toPost} transactions imported` : "Import recorded");
    } catch (e) {
      const message = e instanceof Error ? e.message : "The import service didn't respond.";
      if (batchId) await importService.updateBatch(batchId, { status: "failed", errorMessage: message }).catch(() => undefined);
      setResult({ batchId: batchId ?? "", summary: snapshot, accountId: account.id, error: message });
      setPhase("error");
    }
  };

  const batch = imports.find((b) => b.id === result?.batchId);

  const resetAll = () => {
    setStep(0);
    setParsed(undefined);
    setProblem(undefined);
    setMapping(undefined);
    setOverrides({});
    setAck(false);
    setPhase("idle");
    setResult(undefined);
  };

  const importAgain = () => {
    setOverrides({});
    setAck(false);
    setPhase("idle");
    setResult(undefined);
    setStep(2);
  };

  const accountBal = account ? accountBalance(account, transactions) : 0;
  const lastImport = account ? imports.find((b) => b.accountId === account.id && b.status !== "failed") : undefined;

  return (
    <>
      <UnsavedChangesGuard when={!!parsed && phase === "idle" && step > 0} message="Your statement hasn't been imported yet. Leave and discard the review?" />
      <PageHeader title="Import bank statement" description="Upload a statement, review AI category suggestions and duplicates, then confirm. Nothing is posted until you confirm." />
      <BankingNav />

      {retryBatch && phase === "idle" && step === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/30 bg-info-light/50 px-3 py-2 text-sm text-info-text" role="note">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Retrying <strong>{retryBatch.fileName}</strong>{retryBatch.accountId ? ` for ${accountName(retryBatch.accountId)}` : ""}. Previous error: {retryBatch.errorMessage ?? "unknown"} Upload a fresh CSV export or pick a sample.
          </p>
        </div>
      )}

      <Card className="gap-0 py-0">
        <div className="space-y-4 border-b px-5 py-4">
          <Steps steps={STEPS} current={step} />
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
              {step + 1}. {STEPS[step].label}
            </h2>
            <p className="text-sm text-muted-foreground">{STEP_HELP[step]}</p>
          </div>
        </div>

        <div className="p-5">
          {step === 0 && (
            <UploadStep
              parsed={parsed}
              parsing={parsing}
              problem={problem}
              onFile={onFile}
              onSample={onSample}
              onRetry={() => lastSource && void handleText(lastSource.text, lastSource.fileName, lastSource.fileSize, lastSource.sample)}
              onClear={() => {
                setParsed(undefined);
                setProblem(undefined);
              }}
            />
          )}

          {step === 1 && parsed && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
              <div className="space-y-4">
                <Field label="Financial account" htmlFor="imp-account" required helper="Only active accounts in your branch scope are listed.">
                  <AccountSelect id="imp-account" value={accountId} onChange={setAccountId} aria-invalid={!account} />
                </Field>
                {currencyMismatch && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-light/40 px-3 py-2 text-sm text-error-text">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    This statement is in {parsed.currency}, but {account?.name} holds {account?.currency}. Choose a {parsed.currency} account — amounts are never converted on import.
                  </div>
                )}
                {providerMismatch && !currencyMismatch && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-light/50 px-3 py-2 text-sm text-warning-text">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    This looks like a {parsed.format.bank} export, but {account?.name} is a {account?.provider} account. Continue only if you&apos;re sure it belongs here.
                  </div>
                )}
                {account?.type === "cash" && <p className="text-xs text-muted-foreground">Cash drawers don&apos;t usually have bank statements — consider Till balancing instead.</p>}
              </div>
              {account && (
                <Card className="gap-3 p-4">
                  <p className="text-sm font-medium">{account.name}</p>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Provider</dt>
                      <dd>
                        {account.provider} · {account.accountNumber}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Current balance</dt>
                      <dd>
                        <Money amount={accountBal} currency={account.currency} className="font-medium" />
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Last import</dt>
                      <dd className="flex flex-wrap items-center gap-2">
                        {lastImport ? (
                          <>
                            {lastImport.fileName} · {formatDateTime(lastImport.createdAt)} <StatusBadge status={lastImport.status} />
                          </>
                        ) : (
                          "No previous imports"
                        )}
                      </dd>
                    </div>
                  </dl>
                </Card>
              )}
            </div>
          )}

          {step === 2 && parsed && mapping && account && <MappingStep parsed={parsed} mapping={mapping} onChange={setMapping} mapped={mapped} currency={account.currency} autoDetected />}
          {step === 3 && account && <CategorizeStep rows={reviewed} currency={account.currency} onSetCategory={(line, categoryId) => setOverride(line, { categoryId })} onAcceptAll={acceptAll} />}
          {step === 4 && account && <DuplicatesStep rows={reviewed} currency={account.currency} onOverride={setOverride} />}
          {step === 5 && account && parsed && <ConfirmStep summary={summary} account={account} fileName={parsed.fileName} acknowledged={ack} onAcknowledge={setAck} />}
          {step === 6 && phase !== "idle" && <ResultStep phase={phase} batch={batch} result={result} currency={account?.currency ?? "USD"} onRetry={commit} onAgain={importAgain} onNew={resetAll} />}
        </div>

        {step < 6 && (
          <div className="flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft /> Back
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              {step >= 3 && account && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {summary.toPost} to post · {summary.toReview} to review · {summary.duplicates} duplicates · {summary.errors} errors
                </p>
              )}
              {step < 5 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                  Continue <ArrowRight />
                </Button>
              ) : (
                <Button onClick={commit} disabled={!canNext || phase !== "idle"}>
                  {phase === "processing" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                  {summary.toPost ? `Confirm and post ${summary.toPost} transaction${summary.toPost === 1 ? "" : "s"}` : "Confirm and record import"}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
      {step >= 3 && step < 6 && (
        <DemoNotice variant="ai" className="mt-4">
          Category suggestions and confidence scores are simulated with deterministic keyword rules in this demo. Duplicate detection compares account, date, signed amount and description.
        </DemoNotice>
      )}
    </>
  );
}
