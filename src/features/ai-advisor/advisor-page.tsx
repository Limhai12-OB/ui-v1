"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  FileWarning,
  GitCompareArrows,
  History,
  ListOrdered,
  Lock,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AdvisorMessage } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useT } from "@/hooks/use-t";
import { aiService, type AdvisorScope } from "@/lib/api";
import { formatDate, formatMonth, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { AIBadge, DemoNotice } from "@/components/shared/demo-notice";
import { PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SUGGESTED_QUESTIONS } from "./engine";
import { ConversationList } from "./conversation-list";
import { MessageBlock, RichText } from "./message-blocks";

const MAX_CHARS = 500;

const SUGGESTION_ICONS: LucideIcon[] = [TrendingUp, Building2, BarChart3, ListOrdered, GitCompareArrows, FileWarning, Wallet, Boxes, ShoppingBasket];

export function AdvisorPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdvisorInner />
    </Suspense>
  );
}

function AdvisorInner() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const conversations = useAppStore((s) => s.conversations);
  const { scope, branch, money, isOwner } = useScope();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ convId: string; message: string } | null>(null);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const requested = params.get("c");
  const active = conversations.find((c) => c.id === requested) ?? null;
  const activeId = active?.id ?? null;

  const scopeLabel = branch ? branch.name : "All branches";
  const asOf = today();
  const advisorScope: AdvisorScope = useMemo(
    () => ({ scope, scopeLabel, multiBranch: scope.branchIds.length > 1, money, asOf }),
    [scope, scopeLabel, money, asOf],
  );

  const select = useCallback(
    (id: string | null) => {
      router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
      setHistoryOpen(false);
      setFailed(null);
    },
    [router, pathname],
  );

  const busy = pending !== null;

  // Keep the newest message in view.
  const messageCount = active?.messages.length ?? 0;
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messageCount, pending, activeId]);

  const send = async (raw: string) => {
    const q = raw.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    setFailed(null);
    setDraft("");
    let id = activeId;
    try {
      if (!id) {
        const c = await aiService.startConversation(q);
        id = c.id;
        router.replace(`${pathname}?c=${id}`, { scroll: false });
      }
      setPending(id);
      await aiService.ask(id, q, advisorScope);
    } catch (e) {
      if (id) setFailed({ convId: id, message: e instanceof Error ? e.message : "The advisor couldn't answer. Please try again." });
    } finally {
      setPending(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const retry = async () => {
    if (!failed || busy) return;
    const id = failed.convId;
    setFailed(null);
    setPending(id);
    try {
      await aiService.retry(id, advisorScope);
    } catch (e) {
      setFailed({ convId: id, message: e instanceof Error ? e.message : "The advisor couldn't answer. Please try again." });
    } finally {
      setPending(null);
    }
  };

  const list = (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      onSelect={(id) => select(id)}
      onNew={() => select(null)}
      onDeleted={(id) => id === activeId && select(null)}
      disabled={busy}
    />
  );

  const lastIsUnanswered = active && active.messages.length > 0 && active.messages[active.messages.length - 1].role === "user";

  return (
    <div className="flex h-[calc(100dvh-3.5rem-3rem)] min-h-[560px] flex-col">
      <PageHeader
        className="mb-4 shrink-0"
        title={t("nav.advisor")}
        meta={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="neutral" tabIndex={0} className="cursor-default">
                  <Lock /> Read-only
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-60 text-xs">The advisor can read and explain your data. It never creates, edits or deletes records.</TooltipContent>
            </Tooltip>
            <AIBadge label="Simulated AI" />
          </>
        }
        description="Ask questions about revenue, expenses, branches, invoices, cash and stock. Answers are computed from your current data."
        actions={
          <>
            <Button variant="outline" className="lg:hidden" onClick={() => setHistoryOpen(true)}>
              <History /> History
            </Button>
            <Button variant="outline" onClick={() => select(null)} disabled={busy || !activeId}>
              <Plus /> New chat
            </Button>
          </>
        }
      />

      <Card className="min-h-0 flex-1 flex-row gap-0 py-0">
        <aside className="hidden w-72 shrink-0 border-r lg:block">{list}</aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Conversation">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate font-medium text-foreground">{active?.title ?? "New conversation"}</span>
            <span className="tabular-nums">
              Scope: <span className="font-medium text-foreground">{scopeLabel}</span> · {money.display} · data through {formatDate(asOf)}
              {isOwner && <span className="hidden sm:inline"> · change with the branch selector</span>}
            </span>
          </div>

          <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
            {!active || active.messages.length === 0 ? (
              <EmptyThread onAsk={send} disabled={busy} scopeLabel={scopeLabel} />
            ) : (
              <ol className="mx-auto max-w-3xl space-y-6 px-4 py-6" aria-live="polite" aria-relevant="additions">
                {active.messages.map((m) => (
                  <li key={m.id}>{m.role === "user" ? <UserBubble message={m} /> : <AssistantMessage message={m} onFollowUp={send} disabled={busy} />}</li>
                ))}
                {pending === activeId && (
                  <li>
                    <Thinking label={`Analyzing demo data for ${formatMonth(asOf.slice(0, 7))} · ${scopeLabel}…`} />
                  </li>
                )}
                {failed?.convId === activeId && lastIsUnanswered && !busy && (
                  <li role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-error/30 bg-error-light px-3 py-2.5 text-sm text-error-text">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{failed.message}</span>
                    <Button size="sm" variant="outline" onClick={retry}>
                      <RefreshCw /> Try again
                    </Button>
                  </li>
                )}
              </ol>
            )}
          </div>

          <Composer value={draft} onChange={setDraft} onSubmit={() => send(draft)} disabled={busy} inputRef={inputRef} disclaimer={t("ai.disclaimer")} />
        </section>
      </Card>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-80 gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Conversation history</SheetTitle>
            <SheetDescription>Your saved advisor conversations</SheetDescription>
          </SheetHeader>
          {list}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EmptyThread({ onAsk, disabled, scopeLabel }: { onAsk: (q: string) => void; disabled: boolean; scopeLabel: string }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-ai-light text-ai-text">
        <Sparkles className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">What would you like to know?</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Answers use the same figures as your dashboard and reports for <span className="font-medium text-foreground">{scopeLabel}</span>, with links to the underlying records.
      </p>
      <ul className="mt-6 grid w-full gap-2 text-left sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTED_QUESTIONS.map((q, i) => {
          const Icon = SUGGESTION_ICONS[i] ?? Sparkles;
          return (
            <li key={q}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAsk(q)}
                className="group flex h-full w-full items-start gap-3 rounded-xl border bg-card p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary-light/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-primary">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="pt-0.5 text-foreground">{q}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <DemoNotice variant="ai" className="mt-6 text-left">
        Simulated advisor: questions are matched to predefined question types and answered with figures calculated from your demo data. It can't answer everything, and it never changes records.
      </DemoNotice>
    </div>
  );
}

function UserBubble({ message }: { message: AdvisorMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
        <span className="sr-only">You asked: </span>
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({ message, onFollowUp, disabled }: { message: AdvisorMessage; onFollowUp: (q: string) => void; disabled: boolean }) {
  return (
    <article className="flex gap-3" aria-label="Advisor answer">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ai-light text-ai-text" aria-hidden>
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">LedgerVision Advisor</span>
          <AIBadge label="Simulated" />
        </div>
        <RichText text={message.content} />
        {message.blocks?.map((b, i) => <MessageBlock key={i} block={b} />)}
        {!!message.references?.length && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sources & related pages</p>
            <ul className="flex flex-wrap gap-1.5">
              {message.references.map((r) => (
                <li key={r.href + r.label}>
                  <Link
                    href={r.href}
                    className="inline-flex max-w-72 items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="truncate">{r.label}</span>
                    <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!message.followUps?.length && (
          <div className="flex flex-wrap gap-1.5" aria-label="Suggested follow-up questions">
            {message.followUps.map((f) => (
              <button
                key={f}
                type="button"
                disabled={disabled}
                onClick={() => onFollowUp(f)}
                className="rounded-full border border-ai/25 bg-ai-light/60 px-3 py-1 text-xs text-ai-text transition-colors hover:bg-ai-light focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ai-light text-ai-text" aria-hidden>
        <Sparkles className="size-3.5" />
      </span>
      <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border bg-card px-4 py-3">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((d) => (
            <span key={d} className="size-1.5 animate-bounce rounded-full bg-ai" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  inputRef,
  disclaimer,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  disclaimer: string;
}) {
  const remaining = MAX_CHARS - value.length;
  return (
    <div className="shrink-0 border-t bg-card px-4 pt-3 pb-3">
      <form
        className="mx-auto max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="advisor-input" className="sr-only">
          Ask the advisor a question
        </label>
        <div className={cn("flex items-end gap-2 rounded-xl border bg-background p-2 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30", disabled && "opacity-70")}>
          <Textarea
            id="advisor-input"
            ref={inputRef}
            value={value}
            maxLength={MAX_CHARS}
            rows={1}
            disabled={disabled}
            placeholder={disabled ? "Waiting for the answer…" : "Ask about revenue, expenses, branches, invoices…"}
            aria-describedby="advisor-hint advisor-disclaimer"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Button type="submit" size="icon" disabled={disabled || !value.trim()} aria-label="Send question">
            <ArrowUp />
          </Button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <p id="advisor-disclaimer">{disclaimer}</p>
          <p id="advisor-hint" className="tabular-nums">
            <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift+Enter</kbd> new line ·{" "}
            <span className={cn(remaining < 50 && "font-medium text-warning-text")}>{value.length}/{MAX_CHARS}</span>
          </p>
        </div>
      </form>
    </div>
  );
}
