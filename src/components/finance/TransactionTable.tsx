import { MoreHorizontal, Pencil, Trash2, Check } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import {
  PAYMENT_STATUS_LABEL,
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

  async function remove(id: string) {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
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
                  <Badge variant={transaction.payment_status === "paid" ? "secondary" : "outline"}>
                    {PAYMENT_STATUS_LABEL[transaction.payment_status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(transaction)}>
                        <Pencil className="mr-2 size-4" /> Bearbeiten
                      </DropdownMenuItem>
                      {transaction.payment_status !== "paid" ? (
                        <DropdownMenuItem onClick={() => void markPaid(transaction)}>
                          <Check className="mr-2 size-4" /> Als bezahlt markieren
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onClick={() => void remove(transaction.id)}>
                        <Trash2 className="mr-2 size-4" /> Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
