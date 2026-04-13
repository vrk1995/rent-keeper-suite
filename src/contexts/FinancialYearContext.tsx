import React, { createContext, useContext, useState, ReactNode } from "react";
import { FinancialYear, getCurrentFY } from "@/lib/financialYear";

interface FinancialYearContextType {
  selectedFY: FinancialYear;
  setSelectedFY: (fy: FinancialYear) => void;
}

const FinancialYearContext = createContext<FinancialYearContextType | undefined>(undefined);

export const FinancialYearProvider = ({ children }: { children: ReactNode }) => {
  const [selectedFY, setSelectedFY] = useState<FinancialYear>(getCurrentFY());

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
