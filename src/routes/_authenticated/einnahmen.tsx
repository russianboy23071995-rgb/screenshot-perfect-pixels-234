import { createFileRoute } from "@tanstack/react-router";

import { TransactionsPage } from "@/components/finance/TransactionsPage";

export const Route = createFileRoute("/_authenticated/einnahmen")({
  head: () => ({
    meta: [
      { title: "Einnahmen · Finanz-Cockpit" },
      {
        name: "description",
        content: "Alle Rechnungen und Einnahmen mit Netto, Umsatzsteuer und Zahlungsstatus.",
      },
      { property: "og:title", content: "Einnahmen · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Rechnungen erfassen, Zahlungen verfolgen, Umsatzsteuer im Blick behalten.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <TransactionsPage type="income" />,
});
