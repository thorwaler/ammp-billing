import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface CurrencyContextType {
  currency: "EUR" | "USD";
  exchangeRate: number;
  setCurrency: (currency: "EUR" | "USD") => void;
  setExchangeRate: (rate: number) => void;
  formatCurrency: (amount: number) => string;
  convertToDisplayCurrency: (usdAmount: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const STORAGE_KEY_CURRENCY = "app_currency";
const STORAGE_KEY_EXCHANGE_RATE = "app_exchange_rate";
const DEFAULT_EXCHANGE_RATE = 0.92; // Default USD to EUR rate

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<"EUR" | "USD">(() => {
    const stored = localStorage.getItem(STORAGE_KEY_CURRENCY);
    return (stored as "EUR" | "USD") || "EUR";
  });

  const [exchangeRate, setExchangeRateState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY_EXCHANGE_RATE);
    return stored ? parseFloat(stored) : DEFAULT_EXCHANGE_RATE;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CURRENCY, currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EXCHANGE_RATE, exchangeRate.toString());
  }, [exchangeRate]);

  const setCurrency = (newCurrency: "EUR" | "USD") => {
    setCurrencyState(newCurrency);
  };

  const setExchangeRate = (rate: number) => {
    setExchangeRateState(rate);
  };

  const convertToDisplayCurrency = (usdAmount: number): number => {
    if (currency === "USD") {
      return usdAmount;
    }
    return usdAmount * exchangeRate;
  };

  const formatCurrency = (amount: number): string => {
    const symbol = currency === "EUR" ? "€" : "$";
    const formattedAmount = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    
    return currency === "EUR" 
      ? `${symbol}${formattedAmount}` 
      : `${symbol}${formattedAmount}`;
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        exchangeRate,
        setCurrency,
        setExchangeRate,
        formatCurrency,
        convertToDisplayCurrency,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
