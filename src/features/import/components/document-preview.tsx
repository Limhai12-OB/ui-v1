"use client";

/* eslint-disable @next/next/no-img-element -- object URLs of local uploads can't use next/image */
import { CheckCircle2, FileText } from "lucide-react";
import type { BillDoc, PaymentDoc, ReceiptDoc } from "../lib/doc-samples";
import { formatBytes } from "../lib/csv";

export type PreviewSource =
  | { type: "sample"; doc: ReceiptDoc | BillDoc | PaymentDoc }
  | { type: "image"; url: string; fileName: string; fileSize: number }
  | { type: "pdf"; fileName: string; fileSize: number }
  | { type: "table"; fileName: string; headers: string[]; rows: string[][] };

/** The original document, shown beside the editable extracted fields. */
export function DocumentPreview({ source }: { source: PreviewSource }) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-muted/40">
      <figcaption className="flex items-center justify-between border-b bg-card px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Original document</span>
        <span>{source.type === "sample" ? "Built-in sample" : source.type === "table" ? source.fileName : `${source.fileName} · ${formatBytes(source.fileSize)}`}</span>
      </figcaption>
      <div className="flex max-h-[640px] justify-center overflow-auto p-4">
        {source.type === "image" && <img src={source.url} alt={`Uploaded document ${source.fileName}`} className="h-auto max-w-full rounded-md object-contain shadow-sm" />}
        {source.type === "pdf" && (
          <div className="flex h-72 w-full max-w-sm flex-col items-center justify-center gap-2 rounded-md border bg-card text-center">
            <FileText className="size-10 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{source.fileName}</p>
            <p className="max-w-60 text-xs text-muted-foreground">PDF preview isn&apos;t rendered in the demo. The import service renders pages when connected.</p>
          </div>
        )}
        {source.type === "table" && (
          <div className="w-full overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="bg-muted/60">
                <tr>
                  {source.headers.map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {source.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((c, j) => (
                      <td key={j} className="px-2 py-1 whitespace-nowrap">
                        {c || <span className="text-muted-foreground">∅</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {source.type === "sample" && source.doc.type === "receipt" && <Receipt d={source.doc} />}
        {source.type === "sample" && source.doc.type === "bill" && <Bill d={source.doc} />}
        {source.type === "sample" && source.doc.type === "payment" && <Payment d={source.doc} />}
      </div>
    </figure>
  );
}

function Receipt({ d }: { d: ReceiptDoc }) {
  return (
    <div className="w-72 rotate-[-0.6deg] bg-white px-5 py-6 font-mono text-[11px] leading-relaxed text-neutral-800 shadow-md" aria-label="Sample receipt">
      <p className="text-center text-sm font-bold tracking-wide">{d.merchant}</p>
      <p className="text-center">{d.address}</p>
      <p className="text-center">{d.vatTin}</p>
      <p className="my-2 border-t border-dashed border-neutral-400" />
      <p>Date: {d.dateText}</p>
      <p>Receipt: {d.no}</p>
      <p className="my-2 border-t border-dashed border-neutral-400" />
      {d.lines.map((l) => (
        <div key={l.label}>
          <p>{l.label}</p>
          <p className="flex justify-between">
            <span>{l.qty}</span>
            <span>{l.amount}</span>
          </p>
        </div>
      ))}
      <p className="my-2 border-t border-dashed border-neutral-400" />
      <p className="flex justify-between text-sm font-bold">
        <span>TOTAL USD</span>
        <span>{d.total}</span>
      </p>
      <p className="flex justify-between">
        <span>TOTAL KHR (4,100)</span>
        <span>{d.khrTotal}</span>
      </p>
      <p className="mt-2">Paid by: {d.paidBy}</p>
      <p className="mt-3 text-center">*** ARKUN ***  Thank you</p>
    </div>
  );
}

function Bill({ d }: { d: BillDoc }) {
  return (
    <div className="w-full max-w-md bg-white p-6 text-[12px] text-neutral-800 shadow-md" aria-label="Sample bill">
      <div className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-3">
        <div>
          <p className="text-sm font-bold">{d.issuer}</p>
          {d.issuerKm && (
            <p lang="km" className="text-xs">
              {d.issuerKm}
            </p>
          )}
          <p className="text-[11px] text-neutral-500">{d.address}</p>
        </div>
        <p className="text-right text-base font-semibold tracking-wide text-neutral-600">INVOICE</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-neutral-500">Bill to</dt>
        <dd>{d.billTo}</dd>
        <dt className="text-neutral-500">Invoice no.</dt>
        <dd className="font-mono">{d.no}</dd>
        <dt className="text-neutral-500">Date</dt>
        <dd>{d.dateText}</dd>
        <dt className="text-neutral-500">Due</dt>
        <dd>{d.dueText}</dd>
      </dl>
      <table className="mt-4 w-full">
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.label} className="border-t border-neutral-200">
              <td className="py-1.5">{l.label}</td>
              <td className="py-1.5 text-right tabular-nums">{l.amount}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-neutral-400 font-bold">
            <td className="py-2">TOTAL DUE ({d.currency})</td>
            <td className="py-2 text-right tabular-nums">{d.total}</td>
          </tr>
        </tbody>
      </table>
      {d.note && <p className="mt-3 text-[11px] text-neutral-500">{d.note}</p>}
    </div>
  );
}

function Payment({ d }: { d: PaymentDoc }) {
  return (
    <div className="w-64 overflow-hidden rounded-[28px] border-[6px] border-neutral-800 bg-white text-neutral-800 shadow-lg" aria-label="Sample payment screenshot">
      <div className="bg-sky-900 px-4 pt-5 pb-8 text-center text-white">
        <p className="text-[11px] opacity-80">{d.app}</p>
        <CheckCircle2 className="mx-auto mt-3 size-9 text-success" aria-hidden />
        <p className="mt-2 text-xs">Transfer successful</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {d.currency === "USD" ? "$" : "៛"}
          {d.amount}
        </p>
      </div>
      <dl className="-mt-4 space-y-2 rounded-t-2xl bg-white px-4 py-4 text-[11px]">
        {[
          ["From", `${d.from}\n${d.fromAcc}`],
          ["To", `${d.to}\n${d.toAcc}`],
          ["Trx. ID", d.trxId],
          ["Date", d.dateText],
          ["Remark", d.remark],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-neutral-100 pb-1.5">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="text-right font-medium whitespace-pre-line">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
