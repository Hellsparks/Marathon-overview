import { createContext, useContext } from 'react';

export const PrinterStatusContext = createContext({});

export function usePrinterStatus() {
  return useContext(PrinterStatusContext);
}
