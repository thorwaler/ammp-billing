import { useCurrency } from "@/contexts/CurrencyContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Settings, DollarSign, Euro, RefreshCw } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

export function CurrencySwitcher() {
  const { 
    currency, 
    exchangeRate, 
    setCurrency, 
    setExchangeRate,
    fetchLiveRate,
    lastRateUpdate,
    isFetchingRate
  } = useCurrency();
  const [tempRate, setTempRate] = useState(exchangeRate.toString());

  const handleSaveRate = () => {
    const rate = parseFloat(tempRate);
    if (!isNaN(rate) && rate > 0) {
      setExchangeRate(rate);
    }
  };

  const handleFetchLiveRate = async () => {
    await fetchLiveRate();
    setTempRate(exchangeRate.toString());
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={currency} onValueChange={(value: "EUR" | "USD") => setCurrency(value)}>
        <SelectTrigger className="w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="EUR">
            <div className="flex items-center gap-2">
              <Euro className="h-4 w-4" />
              EUR
            </div>
          </SelectItem>
          <SelectItem value="USD">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              USD
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Currency settings</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Currency Settings</h4>
              <p className="text-sm text-muted-foreground">
                Configure the USD to EUR exchange rate
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="exchange-rate">USD to EUR Exchange Rate</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleFetchLiveRate}
                  disabled={isFetchingRate}
                  className="h-7 px-2"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isFetchingRate ? 'animate-spin' : ''}`} />
                  {isFetchingRate ? 'Fetching...' : 'Live Rate'}
                </Button>
              </div>
              <Input
                id="exchange-rate"
                type="number"
                step="0.0001"
                min="0"
                value={tempRate}
                onChange={(e) => setTempRate(e.target.value)}
                placeholder="0.92"
              />
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">
                  Current: 1 USD = {exchangeRate.toFixed(4)} EUR
                </p>
                {lastRateUpdate && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {formatDistanceToNow(lastRateUpdate, { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>
            <Button onClick={handleSaveRate} className="w-full">
              Save Exchange Rate
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
