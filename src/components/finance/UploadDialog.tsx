import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileUp, Loader2, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { TransactionPrefill } from "@/components/finance/TransactionDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAppState } from "@/lib/app-state";
import {
  findDuplicateDocuments,
  findDuplicateTransactions,
  type DuplicateMatch,
} from "@/lib/duplicates";
import { extractReceipt, type ExtractedReceipt } from "@/lib/extract.functions";
import {
  getOwnerTestMode,
  useCategories,
  useDocuments,
  useInvalidateFinance,
  useTransactions,
  type DocumentRow,
} from "@/lib/finance";
import { formatDate, formatEur } from "@/lib/money";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseData: (prefill: TransactionPrefill) => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

export function UploadDialog({ open, onOpenChange, onUseData }: Props) {
  const { fiscalYear } = useAppState();
  const invalidate = useInvalidateFinance();
  const { data: categories = [] } = useCategories();
  const { data: documents = [] } = useDocuments();
  const { data: transactions = [] } = useTransactions(fiscalYear);
  const runExtract = useServerFn(extractReceipt);
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string>("");
  const [result, setResult] = useState<ExtractedReceipt | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [docDupes, setDocDupes] = useState<DocumentRow[]>([]);
  const [txDupes, setTxDupes] = useState<DuplicateMatch[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);

  const expenseCategories = categories.filter((c) => c.type === "expense" && c.active);

  function suggestedCategory(extracted: ExtractedReceipt | null) {
    if (!extracted) return null;
    const wanted = (extracted.category ?? extracted.category_hint ?? "").toLowerCase().trim();
    if (!wanted) return null;
    return (
      expenseCategories.find((c) => c.name.toLowerCase() === wanted) ??
      expenseCategories.find(
        (c) => c.name.toLowerCase().includes(wanted) || wanted.includes(c.name.toLowerCase()),
      ) ??
      null
    );
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewIsPdf(false);
    setResult(null);
    setDocumentId(null);
    setStep("");
    setBusy(false);
    setDocDupes([]);
    setTxDupes([]);
  }

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    setTxDupes([]);
    setDocDupes(findDuplicateDocuments(documents, file));
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setPreviewIsPdf(file.type === "application/pdf");
    try {
      setStep("Beleg wird hochgeladen …");
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Bitte melde dich erneut an.");
      const path = `${userId}/${fiscalYear}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("belege").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (uploadError) throw uploadError;

      const { data: docRow, error: docError } = await supabase
        .from("documents")
        .insert({
          filename: safeName,
          original_filename: file.name,
          file_type: file.type || "application/octet-stream",
          storage_path: path,
          sync_status: "app_only",
          is_demo: await getOwnerTestMode(),
        })
        .select("id")
        .single();
      if (docError) throw docError;
      setDocumentId(docRow?.id ?? null);

      setStep("Beleg wird ausgelesen …");
      const dataUrl = await readAsDataUrl(file);
      const extracted = await runExtract({
        data: {
          fileData: dataUrl,
          mimeType: file.type || "application/pdf",
          filename: file.name,
          categories: expenseCategories.map((c) => c.name),
        },
      });
      setResult(extracted);

      const grossCents =
        extracted.gross != null
          ? Math.round(extracted.gross * 100)
          : extracted.net != null && extracted.tax_rate != null
            ? Math.round(extracted.net * 100 * (1 + extracted.tax_rate / 100))
            : null;
      setTxDupes(
        findDuplicateTransactions(transactions, {
          counterparty: extracted.counterparty,
          invoice_number: extracted.invoice_number,
          invoice_date: extracted.invoice_date,
          gross_cents: grossCents,
        }),
      );


      if (docRow?.id) {
        await supabase
          .from("documents")
          .update({
            extracted_data: extracted as unknown as Json,
            confidence: extracted.confidence,
          })
          .eq("id", docRow.id);
      }
      invalidate();
      toast.success("Beleg gespeichert und ausgelesen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  function useExtracted() {
    if (!result) return;
    const netCents =
      result.net != null
        ? Math.round(result.net * 100)
        : result.gross != null && result.tax_rate != null
          ? Math.round((result.gross * 100) / (1 + result.tax_rate / 100))
          : undefined;
    const match = suggestedCategory(result);
    onUseData({
      counterparty: result.counterparty ?? undefined,
      invoice_number: result.invoice_number ?? undefined,
      description: result.description ?? undefined,
      invoice_date: result.invoice_date ?? undefined,
      service_date: result.service_date ?? undefined,
      net_cents: netCents,
      tax_rate: result.tax_rate ?? undefined,
      category_id: match?.id,
      documentId: documentId ?? undefined,
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="glass-strong sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Beleg hochladen</DialogTitle>
          <DialogDescription>
            PDF oder Foto. Die Daten werden automatisch erkannt und können übernommen werden.
          </DialogDescription>
        </DialogHeader>

        <div className={previewUrl ? "grid gap-4 lg:grid-cols-2" : ""}>
          {previewUrl ? (
            <div className="glass flex items-center justify-center overflow-hidden p-2">
              {previewIsPdf ? (
                <iframe
                  key={previewUrl}
                  src={`${previewUrl}#toolbar=0&view=FitH`}
                  title="Beleg-Vorschau"
                  className="h-[28rem] w-full rounded-md bg-background"
                />
              ) : (
                <img
                  key={previewUrl}
                  src={previewUrl}
                  alt="Beleg-Vorschau"
                  className="max-h-[28rem] w-auto rounded-md object-contain"
                />
              )}
            </div>
          ) : null}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`glass flex flex-col items-center justify-center gap-3 self-stretch border-dashed p-6 text-center transition-colors ${
              dragging ? "bg-accent" : ""
            }`}
          >
            {busy ? (
              <>
                <Loader2 className="size-6 animate-spin" />
                <p className="text-sm text-muted-foreground">{step}</p>
              </>
            ) : (
              <>
                <FileUp className="size-6" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">
                  {previewUrl
                    ? "Anderen Beleg wählen?"
                    : "Datei hierher ziehen oder auswählen (PDF, JPG, PNG)"}
                </p>
                <Button variant="outline" onClick={() => inputRef.current?.click()}>
                  {previewUrl ? "Ersetzen" : "Datei auswählen"}
                </Button>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {result ? (
          <div className="glass p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" strokeWidth={1.75} />
              <p className="label-caps">
                Erkannt · Sicherheit {Math.round((result.confidence ?? 0) * 100)} %
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Lieferant</dt>
                <dd className="font-medium">{result.counterparty ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Belegnummer</dt>
                <dd className="font-medium">{result.invoice_number ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Datum</dt>
                <dd className="font-medium">{result.invoice_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Steuersatz</dt>
                <dd className="font-medium">
                  {result.tax_rate != null ? `${result.tax_rate} %` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Netto</dt>
                <dd className="num font-medium">
                  {result.net != null ? formatEur(Math.round(result.net * 100)) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Brutto</dt>
                <dd className="num font-medium">
                  {result.gross != null ? formatEur(Math.round(result.gross * 100)) : "—"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Kategorie-Vorschlag</dt>
                <dd className="font-medium">
                  {suggestedCategory(result)?.name ??
                    (result.category ?? result.category_hint ?? "—")}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {docDupes.length || txDupes.length ? (
          <div className="glass border-destructive/40 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" strokeWidth={1.75} />
              <p className="label-caps text-destructive">Mögliche Dublette</p>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {docDupes.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Gleiche Datei bereits im Archiv: {d.original_filename}
                  </span>
                  <span className="text-muted-foreground">{formatDate(d.upload_date)}</span>
                </li>
              ))}
              {txDupes.map((m) => (
                <li key={m.transaction.id} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-medium">{m.transaction.counterparty || "Ohne Partner"}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatDate(m.transaction.invoice_date)} · {m.reason}
                    </span>
                  </span>
                  <span className="num font-medium">{formatEur(m.transaction.gross_cents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Prüfe die Buchung, bevor du den Beleg übernimmst.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          <Button onClick={useExtracted} disabled={!result}>
            {txDupes.length ? "Trotzdem als Ausgabe übernehmen" : "Als Ausgabe übernehmen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
