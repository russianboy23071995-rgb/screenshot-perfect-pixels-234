import { createFileRoute } from "@tanstack/react-router";

import { TransactionsPage } from "@/components/finance/TransactionsPage";

export const Route = createFileRoute("/_authenticated/ausgaben")({
  head: () => ({
    meta: [
      { title: "Ausgaben · Finanz-Cockpit" },
      {
        name: "description",
        content: "Betriebsausgaben mit Kategorie, Vorsteuer und Abzugsfähigkeit verwalten.",
      },
      { property: "og:title", content: "Ausgaben · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Belege hochladen, automatisch auslesen und als Ausgabe buchen.",
      },
    ],
  }),
  component: () => <TransactionsPage type="expense" />,
});
