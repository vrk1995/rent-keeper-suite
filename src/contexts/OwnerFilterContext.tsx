import React, { createContext, useContext, useState, ReactNode } from "react";

interface OwnerFilterContextType {
  selectedOwnerId: string | null;
  setSelectedOwnerId: (ownerId: string | null) => void;
}

const OwnerFilterContext = createContext<OwnerFilterContextType | undefined>(undefined);

export const OwnerFilterProvider = ({ children }: { children: ReactNode }) => {
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  return (
    <OwnerFilterContext.Provider value={{ selectedOwnerId, setSelectedOwnerId }}>
      {children}
    </OwnerFilterContext.Provider>
  );
};

export const useOwnerFilter = () => {
  const context = useContext(OwnerFilterContext);
  if (context === undefined) {
    throw new Error("useOwnerFilter must be used within an OwnerFilterProvider");
  }
  return context;
};
