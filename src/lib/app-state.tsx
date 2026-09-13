import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface AppState {
  fiscalYear: number;
  setFiscalYear: (year: number) => void;
  years: number[];
}

const AppStateContext = createContext<AppState | null>(null);
const STORAGE_KEY = "finanz-fiscal-year";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setFiscalYear(Number(stored));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(fiscalYear));
  }, [fiscalYear]);

  const value = useMemo<AppState>(
    () => ({
      fiscalYear,
      setFiscalYear,
      years: [currentYear + 1, currentYear, currentYear - 1, currentYear - 2].sort((a, b) => b - a),
    }),
    [fiscalYear, currentYear],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState muss innerhalb von AppStateProvider verwendet werden");
  return context;
}
