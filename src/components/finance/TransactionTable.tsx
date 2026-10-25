import { MoreHorizontal, Pencil, Trash2, Check, History, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransactionDetailSheet } from "@/components/finance/TransactionDetailSheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  BOOKING_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  logAudit,
  useCategories,
  useInvalidateFinance,
  type Transaction,
} from "@/lib/finance";
import { formatDate, formatEur } from "@/lib/money";

export function TransactionTable({
  transactions,
  onEdit,
}: {
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
}) {
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidateFinance();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [stornoTarget, setStornoTarget] = useState<Transaction | null>(null);
  const [stornoCopy, setStornoCopy] = useState(true);
  const [busy, setBusy] = useState(false);

  async function storno() {
    if (!stornoTarget) return;
    setBusy(true);
    const { error } = await supabase.rpc("storno_transaction", {
      p_id: stornoTarget.id,
      p_create_copy: stornoCopy,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      stornoCopy
        ? "Storniert. Ein Korrektur-Entwurf liegt in der Prüfliste."
        : "Storniert – Gegenbuchung angelegt.",
    );
    setStornoTarget(null);
    invalidate();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAudit({ entity_type: "transaction", entity_id: id, action: "dublette", note: "Entwurf gelöscht" });
    toast.success("Buchung gelöscht.");
    invalidate();
  }

  async function markPaid(transaction: Transaction) {
    const { error } = await supabase
      .from("transactions")
      .update({ payment_status: "paid", payment_date: new Date().toISOString().slice(0, 10) })
      .eq("id", transaction.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Als bezahlt markiert.");
    invalidate();
  }

  return (
    <div className="glass overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Datum</TableHead>
              <TableHead>Beleg</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead className="hidden md:table-cell">Kategorie</TableHead>
              <TableHead className="text-right">Netto</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Steuer</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell className="num whitespace-nowrap">
                  {formatDate(transaction.invoice_date)}
                </TableCell>
                <TableCell className="num text-muted-foreground">
                  {transaction.invoice_number ?? "—"}
                </TableCell>
                <TableCell className="max-w-[16rem]">
                  <p className="truncate font-medium">{transaction.counterparty}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {transaction.description}
                  </p>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {categories.find((c) => c.id === transaction.category_id)?.name ?? "—"}
                </TableCell>
                <TableCell className="num text-right">{formatEur(transaction.net_cents)}</TableCell>
                <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">
                  {formatEur(transaction.tax_cents)}
                </TableCell>
                <TableCell className="num text-right font-medium">
                  {formatEur(transaction.gross_cents)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant={
                        transaction.booking_status === "entwurf"
                          ? "outline"
                          : transaction.booking_status === "storniert"
                            ? "destructive"
                            : "default"
                      }
                    >
                      {transaction.storno_of ? "Storno" : BOOKING_STATUS_LABEL[transaction.booking_status]}
                    </Badge>
                    <Badge variant={transaction.payment_status === "paid" ? "secondary" : "outline"}>
                      {PAYMENT_STATUS_LABEL[transaction.payment_status]}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetailId(transaction.id)}>
                        <History className="mr-2 size-4" /> Details & Verlauf
                      </DropdownMenuItem>
                      {transaction.booking_status === "entwurf" ? (
                        <>
                          <DropdownMenuItem onClick={() => onEdit(transaction)}>
                            <Pencil className="mr-2 size-4" /> Bearbeiten
                          </DropdownMenuItem>
                          {transaction.payment_status !== "paid" ? (
                            <DropdownMenuItem onClick={() => void markPaid(transaction)}>
                              <Check className="mr-2 size-4" /> Als bezahlt markieren
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => void remove(transaction.id)}>
                            <Trash2 className="mr-2 size-4" /> Entwurf löschen
                          </DropdownMenuItem>
                        </>
                      ) : transaction.booking_status === "freigegeben" && !transaction.storno_of ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setStornoCopy(true);
                            setStornoTarget(transaction);
                          }}
                        >
                          <Undo2 className="mr-2 size-4" /> Stornieren
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TransactionDetailSheet transactionId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />
      <Dialog open={stornoTarget != null} onOpenChange={(o) => !o && setStornoTarget(null)}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buchung stornieren</DialogTitle>
            <DialogDescription>
              Festgeschriebene Buchungen werden nicht geändert. Es wird eine Gegenbuchung mit negativen
              Beträgen angelegt; die Originalbuchung erhält den Status „Storniert“.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={stornoCopy} onCheckedChange={(v) => setStornoCopy(v === true)} />
            Kopie als neuen Entwurf zum Korrigieren anlegen
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStornoTarget(null)}>
              Abbrechen
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void storno()}>
              <Undo2 className="mr-2 size-4" /> Stornieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
