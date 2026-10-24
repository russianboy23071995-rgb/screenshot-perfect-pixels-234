import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, Copy, ExternalLink, FileCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { EmptyState } from "@/components/finance/GlassCard";
import {
  TransactionDialog,
  type TransactionPrefill,
} from "@/components/finance/TransactionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  REVIEW_STATUS_LABEL,
  SOURCE_LABEL,
  useInvalidateFinance,
  useReviewDocuments,
  type DocumentRow,
} from "@/lib/finance";
import { formatDate, formatEur } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/pruefliste")({
  head: () => ({
    meta: [
      { title: "Prüfliste · Finanz-Cockpit" },
      {
        name: "description",
        content: "Automatisch eingegangene Belege prüfen, als Buchung übernehmen oder ablehnen.",
      },
      { property: "og:title", content: "Prüfliste · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Automatisch eingegangene Belege prüfen, als Buchung übernehmen oder ablehnen.",
      },
    ],
  }),
  component: PrueflistePage,
});

function extractedValues(document: DocumentRow) {
  const e = document.extracted_data;
  if (!e) return null;
  const net = typeof e["net"] === "number" ? (e["net"] as number) : null;
  const rate = typeof e["tax_rate"] === "number" ? (e["tax_rate"] as number) : null;
  const gross =
    typeof e["gross"] === "number"
      ? (e["gross"] as number)
      : net != null
        ? net * (1 + (rate ?? 19) / 100)
        : null;
  return {
    counterparty: typeof e["counterparty"] === "string" ? (e["counterparty"] as string) : null,
    invoiceNumber: typeof e["invoice_number"] === "string" ? (e["invoice_number"] as string) : null,
    invoiceDate: typeof e["invoice_date"] === "string" ? (e["invoice_date"] as string) : null,
    description: typeof e["description"] === "string" ? (e["description"] as string) : null,
    net,
    rate,
    gross,
  };
}

function prefillFrom(document: DocumentRow): TransactionPrefill {
  const e = document.extracted_data;
  return {
    counterparty: typeof e?.["counterparty"] === "string" ? (e["counterparty"] as string) : undefined,
    invoice_number:
      typeof e?.["invoice_number"] === "string" ? (e["invoice_number"] as string) : undefined,
    invoice_date:
      typeof e?.["invoice_date"] === "string" ? (e["invoice_date"] as string) : undefined,
    description: typeof e?.["description"] === "string" ? (e["description"] as string) : undefined,
    net_cents: typeof e?.["net"] === "number" ? Math.round((e["net"] as number) * 100) : undefined,
    tax_rate: typeof e?.["tax_rate"] === "number" ? (e["tax_rate"] as number) : undefined,
    documentId: document.id,
  };
}

function Preview({ document }: { document: DocumentRow }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.storage
      .from("belege")
      .createSignedUrl(document.storage_path, 3600)
      .then(({ data }) => {
        if (!cancelled && data) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [document.storage_path]);

  if (!url) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Vorschau wird geladen …
      </div>
    );
  }
  if (document.file_type === "application/pdf") {
    return (
      <iframe
        src={`${url}#toolbar=0&view=FitH`}
        title={document.original_filename}
        className="h-96 w-full rounded-xl border bg-background"
      />
    );
  }
  if (document.file_type.startsWith("image/")) {
    return (
      <img
        src={url}
        alt={document.original_filename}
        className="max-h-96 w-full rounded-xl border object-contain"
      />
    );
  }
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-sm text-muted-foreground">
      <p>Keine Vorschau für diesen Dateityp.</p>
      <Button variant="outline" size="sm" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-2 size-4" /> Datei öffnen
        </a>
      </Button>
    </div>
  );
}

function PrueflistePage() {
  const { data: documents = [], isLoading } = useReviewDocuments();
  const invalidate = useInvalidateFinance();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DocumentRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmDuplicate(document: DocumentRow) {
    setBusy(true);
    const note = document.review_note
      ? `${document.review_note} – bestätigt`
      : "Dublette bestätigt – keine Buchung angelegt.";
    const { error } = await supabase
      .from("documents")
      .update({ review_status: "geprueft", review_note: note })
      .eq("id", document.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dublette bestätigt.");
    invalidate();
  }

  async function reject() {
    if (!rejectTarget) return;
    if (!rejectNote.trim()) {
      toast.error("Bitte eine Notiz angeben, warum der Beleg abgelehnt wird.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("documents")
      .update({ review_status: "fehler", review_note: rejectNote.trim() })
      .eq("id", rejectTarget.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Beleg abgelehnt – die Datei bleibt im Archiv erhalten.");
    setRejectTarget(null);
    setRejectNote("");
    invalidate();
  }

  return (
    <AppShell
      title="Prüfliste"
      subtitle={
        documents.length === 0
          ? "Keine offenen Prüfungen"
          : `${documents.length} ${documents.length === 1 ? "Beleg wartet" : "Belege warten"} auf Prüfung`
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lade Prüfliste …</p>
      ) : documents.length === 0 ? (
        <EmptyState
          title="Alles geprüft"
          description="Sobald Belege automatisch eingehen (z. B. per E-Mail), erscheinen sie hier zur Prüfung."
        />
      ) : (
        <div className="grid gap-4">
          {documents.map((document) => {
            const values = extractedValues(document);
            return (
              <div key={document.id} className="glass grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
                <Preview document={document} />

                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={document.review_status === "dublette" ? "destructive" : "secondary"}
                    >
                      {REVIEW_STATUS_LABEL[document.review_status]}
                    </Badge>
                    {document.source && (
                      <Badge variant="outline">
                        {SOURCE_LABEL[document.source] ?? document.source}
                      </Badge>
                    )}
                    {document.confidence != null && (
                      <Badge variant="outline">
                        Erkennung {Math.round(document.confidence * 100)} %
                      </Badge>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-medium">{document.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      Eingegangen am {formatDate(document.received_at ?? document.upload_date)}
                    </p>
                  </div>

                  {(document.sender || document.subject) && (
                    <div className="rounded-xl border bg-background/50 p-3 text-sm">
                      {document.sender && (
                        <p className="truncate">
                          <span className="text-muted-foreground">Absender: </span>
                          {document.sender}
                        </p>
                      )}
                      {document.subject && (
                        <p className="truncate">
                          <span className="text-muted-foreground">Betreff: </span>
                          {document.subject}
                        </p>
                      )}
                    </div>
                  )}

                  {values && (
                    <div className="rounded-xl border bg-background/50 p-3 text-sm">
                      <p className="label-caps mb-2">Ausgelesene Werte</p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {values.counterparty && (
                          <>
                            <dt className="text-muted-foreground">Partner</dt>
                            <dd className="truncate">{values.counterparty}</dd>
                          </>
                        )}
                        {values.invoiceNumber && (
                          <>
                            <dt className="text-muted-foreground">Rechnungsnr.</dt>
                            <dd className="truncate">{values.invoiceNumber}</dd>
                          </>
                        )}
                        {values.invoiceDate && (
                          <>
                            <dt className="text-muted-foreground">Datum</dt>
                            <dd>{formatDate(values.invoiceDate)}</dd>
                          </>
                        )}
                        {values.net != null && (
                          <>
                            <dt className="text-muted-foreground">Netto</dt>
                            <dd className="num">{formatEur(Math.round(values.net * 100))}</dd>
                          </>
                        )}
                        {values.gross != null && (
                          <>
                            <dt className="text-muted-foreground">Brutto</dt>
                            <dd className="num">{formatEur(Math.round(values.gross * 100))}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}

                  {document.review_note && (
                    <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs">
                      {document.review_note}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setPrefill(prefillFrom(document));
                        setDialogOpen(true);
                      }}
                    >
                      <FileCheck className="mr-2 size-4" /> Als Buchung übernehmen
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void confirmDuplicate(document)}
                    >
                      <Copy className="mr-2 size-4" /> Dublette bestätigen
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setRejectTarget(document);
                        setRejectNote("");
                      }}
                    >
                      <XCircle className="mr-2 size-4" /> Ablehnen
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type="expense"
        prefill={prefill}
      />

      <Dialog
        open={rejectTarget != null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
      >
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Beleg ablehnen</DialogTitle>
            <DialogDescription>
              Der Beleg wird als fehlerhaft markiert, aber nicht gelöscht. Bitte kurz begründen.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="z. B. kein geschäftlicher Beleg, unleserlich …"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Abbrechen
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void reject()}>
              <CheckCheck className="mr-2 size-4" /> Ablehnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
