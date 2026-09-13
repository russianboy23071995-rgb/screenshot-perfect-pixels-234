import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { EmptyState, KpiCard } from "@/components/finance/GlassCard";
import {
  TransactionDialog,
  type TransactionPrefill,
} from "@/components/finance/TransactionDialog";
import { UploadDialog } from "@/components/finance/UploadDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  SYNC_STATUS_LABEL,
  useDocuments,
  useInvalidateFinance,
  useTransactions,
} from "@/lib/finance";
import { useAppState } from "@/lib/app-state";
import { formatDate } from "@/lib/money";

export const Route = createFileRoute("/belege")({
  head: () => ({
    meta: [
      { title: "Belege · Finanz-Cockpit" },
      {
        name: "description",
        content: "Belege als PDF oder Foto ablegen, automatisch auslesen und Buchungen zuordnen.",
      },
      { property: "og:title", content: "Belege · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Belegarchiv mit automatischer Erkennung und Zuordnung zu Buchungen.",
      },
    ],
  }),
  component: BelegePage,
});

function BelegePage() {
  const { fiscalYear } = useAppState();
  const { data: documents = [] } = useDocuments();
  const { data: transactions = [] } = useTransactions(fiscalYear);
  const invalidate = useInvalidateFinance();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);

  async function openDocument(path: string) {
    const { data, error } = await supabase.storage.from("belege").createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error("Beleg konnte nicht geöffnet werden.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeDocument(id: string, path: string) {
    await supabase.storage.from("belege").remove([path]);
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Beleg gelöscht.");
    invalidate();
  }

  const unlinked = documents.filter((d) => !d.transaction_id);

  return (
    <AppShell
      title="Belege"
      subtitle={`${documents.length} Dokumente im Archiv`}
      actions={
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-2 size-4" /> Beleg hochladen
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Belege gesamt" value={String(documents.length)} />
        <KpiCard
          label="Ohne Buchung"
          value={String(unlinked.length)}
          tone={unlinked.length > 0 ? "negative" : "positive"}
        />
        <KpiCard
          label="Automatisch erkannt"
          value={String(documents.filter((d) => (d.confidence ?? 0) > 0).length)}
        />
      </div>

      <div className="mt-6">
        {documents.length === 0 ? (
          <EmptyState
            title="Noch keine Belege"
            description="Lade PDFs oder Fotos hoch – die Daten werden automatisch erkannt."
            action={
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="mr-2 size-4" /> Beleg hochladen
              </Button>
            }
          />
        ) : (
          <div className="glass overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Datei</TableHead>
                    <TableHead className="hidden sm:table-cell">Hochgeladen</TableHead>
                    <TableHead>Erkennung</TableHead>
                    <TableHead className="hidden md:table-cell">Ablage</TableHead>
                    <TableHead>Buchung</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((document) => {
                    const linked = transactions.find((t) => t.id === document.transaction_id);
                    return (
                      <TableRow key={document.id}>
                        <TableCell className="max-w-[18rem]">
                          <p className="truncate font-medium">{document.original_filename}</p>
                          <p className="text-xs text-muted-foreground">{document.file_type}</p>
                        </TableCell>
                        <TableCell className="num hidden sm:table-cell">
                          {formatDate(document.upload_date)}
                        </TableCell>
                        <TableCell>
                          {document.confidence != null ? (
                            <Badge variant="secondary">
                              {Math.round(document.confidence * 100)} %
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {SYNC_STATUS_LABEL[document.sync_status]}
                        </TableCell>
                        <TableCell className="text-sm">
                          {linked ? (
                            <span className="truncate">{linked.counterparty}</span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const extracted = document.extracted_data as
                                  | Record<string, unknown>
                                  | null;
                                setPrefill({
                                  counterparty: (extracted?.["counterparty"] as string) ?? undefined,
                                  invoice_number:
                                    (extracted?.["invoice_number"] as string) ?? undefined,
                                  invoice_date:
                                    (extracted?.["invoice_date"] as string) ?? undefined,
                                  description: (extracted?.["description"] as string) ?? undefined,
                                  net_cents:
                                    typeof extracted?.["net"] === "number"
                                      ? Math.round((extracted["net"] as number) * 100)
                                      : undefined,
                                  tax_rate:
                                    typeof extracted?.["tax_rate"] === "number"
                                      ? (extracted["tax_rate"] as number)
                                      : undefined,
                                  documentId: document.id,
                                });
                                setDialogOpen(true);
                              }}
                            >
                              Buchen
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void openDocument(document.storage_path)}
                            >
                              <ExternalLink className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                void removeDocument(document.id, document.storage_path)
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUseData={(data) => {
          setPrefill(data);
          setDialogOpen(true);
        }}
      />
      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type="expense"
        prefill={prefill}
      />
    </AppShell>
  );
}
