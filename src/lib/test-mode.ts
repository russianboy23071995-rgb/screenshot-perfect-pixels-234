export function visibleInMode(row: { is_demo?: boolean }, testMode: boolean): boolean {
  return testMode || row.is_demo !== true;
}

export function canStartLive(documents: number, transactions: number): boolean {
  return documents === 0 && transactions === 0;
}

export function requireDeleteConfirmation(value: string): void {
  if (value !== "LÖSCHEN") throw new Error("Bitte LÖSCHEN zur Bestätigung eingeben.");
}