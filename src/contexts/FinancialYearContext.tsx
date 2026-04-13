import React, { createContext, useContext, useState, ReactNode } from "react";
import { FinancialYear } from "@/lib/financialYear";

interface FinancialYearContextType {
  selectedFY: FinancialYear | null;
  setSelectedFY: (fy: FinancialYear | null) => void;
}

const FinancialYearContext = createContext<FinancialYearContextType | undefined>(undefined);

export const FinancialYearProvider = ({ children }: { children: ReactNode }) => {
  const [selectedFY, setSelectedFY] = useState<FinancialYear | null>(null);

  return (
    <FinancialYearContext.Provider value={{ selectedFY, setSelectedFY }}>
      {children}
    </FinancialYearContext.Provider>
  );
};

export const useFinancialYear = () => {
  const context = useContext(FinancialYearContext);
  if (context === undefined) {
    throw new Error("useFinancialYear must be used within a FinancialYearProvider");
  }
  return context;
};
