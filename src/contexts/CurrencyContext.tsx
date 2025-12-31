import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface CurrencyContextType {
  currency: "EUR" | "USD";
  exchangeRate: number;
  setCurrency: (currency: "EUR" | "USD") => void;
  setExchangeRate: (rate: number) => void;
  formatCurrency: (amount: number) => string;
  convertToDisplayCurrency: (amount: number, sourceCurrency?: string) => number;
  loading: boolean;
  fetchLiveRate: () => Promise<number | undefined>;
  lastRateUpdate: Date | null;
  isFetchingRate: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const DEFAULT_EXCHANGE_RATE = 0.92; // Default USD to EUR rate

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState<"EUR" | "USD">("EUR");
  const [exchangeRate, setExchangeRateState] = useState<number>(DEFAULT_EXCHANGE_RATE);
  const [loading, setLoading] = useState(true);
  const [lastRateUpdate, setLastRateUpdate] = useState<Date | null>(null);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  // Load currency settings from database
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadSettings = async () => {
      const { data, error } = await supabase
        .from("currency_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data && !error) {
        setCurrencyState(data.currency as "EUR" | "USD");
        setExchangeRateState(data.exchange_rate);
      }
      setLoading(false);
    };

    loadSettings();
  }, [user]);

  // Save currency to database
  useEffect(() => {
    if (!user || loading) return;

    const saveSettings = async () => {
      await supabase
        .from("currency_settings")
        .update({ 
          currency,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    };

    saveSettings();
  }, [currency, user, loading]);

  // Save exchange rate to database
  useEffect(() => {
    if (!user || loading) return;

    const saveSettings = async () => {
      await supabase
        .from("currency_settings")
        .update({ 
          exchange_rate: exchangeRate,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    };

    saveSettings();
  }, [exchangeRate, user, loading]);

  const setCurrency = (newCurrency: "EUR" | "USD") => {
    setCurrencyState(newCurrency);
  };

  const setExchangeRate = (rate: number) => {
    setExchangeRateState(rate);
  };

  const fetchLiveRate = useCallback(async (): Promise<number | undefined> => {
    setIsFetchingRate(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-exchange-rate');
      
      if (error) {
        console.error('Error fetching live rate:', error);
        return undefined;
      }
      
      if (data?.rate && typeof data.rate === 'number') {
        setExchangeRateState(data.rate);
        setLastRateUpdate(new Date(data.fetchedAt));
        
        // Also save to database if user is logged in
        if (user) {
          await supabase
            .from("currency_settings")
            .update({ 
              exchange_rate: data.rate,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id);
        }
        
        return data.rate;
      }
      return undefined;
    } catch (error) {
      console.error('Error fetching live rate:', error);
      return undefined;
    } finally {
      setIsFetchingRate(false);
    }
  }, [user]);

  const convertToDisplayCurrency = useCallback((amount: number, sourceCurrency: string = "USD"): number => {
    // If source and display currency are the same, no conversion needed
    if (sourceCurrency === currency) {
      return amount;
    }
    
    // If displaying in USD and source is EUR, divide by exchange rate
    if (currency === "USD" && sourceCurrency === "EUR") {
      return amount / exchangeRate;
    }
    
    // If displaying in EUR and source is USD, multiply by exchange rate
    if (currency === "EUR" && sourceCurrency === "USD") {
      return amount * exchangeRate;
    }
    
    return amount;
  }, [currency, exchangeRate]);

  const formatCurrency = useCallback((amount: number): string => {
    const symbol = currency === "EUR" ? "€" : "$";
    const formattedAmount = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    
    return currency === "EUR" 
      ? `${symbol}${formattedAmount}` 
      : `${symbol}${formattedAmount}`;
  }, [currency]);

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        exchangeRate,
        setCurrency,
        setExchangeRate,
        formatCurrency,
        convertToDisplayCurrency,
        loading,
        fetchLiveRate,
        lastRateUpdate,
        isFetchingRate,
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
