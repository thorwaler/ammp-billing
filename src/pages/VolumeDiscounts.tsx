import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Save, Percent } from "lucide-react";

interface VolumeDiscountSettings {
  annualUpfrontDiscount: number;
  siteSizeDiscountThreshold: number;
  siteSizeDiscount: number;
  portfolio50MW: number;
  portfolio100MW: number;
  portfolio150MW: number;
  portfolio200MW: number;
}

const defaultSettings: VolumeDiscountSettings = {
  annualUpfrontDiscount: 5,
  siteSizeDiscountThreshold: 3,
  siteSizeDiscount: 0,
  portfolio50MW: 5,
  portfolio100MW: 10,
  portfolio150MW: 15,
  portfolio200MW: 20,
};

export default function VolumeDiscounts() {
  const [settings, setSettings] = useState<VolumeDiscountSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem("volumeDiscountSettings");
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const handleChange = (field: keyof VolumeDiscountSettings, value: string) => {
    const numValue = parseFloat(value) || 0;
    setSettings((prev) => ({
      ...prev,
      [field]: numValue,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    localStorage.setItem("volumeDiscountSettings", JSON.stringify(settings));
    setHasChanges(false);
    toast({
      title: "Settings saved",
      description: "Volume discount settings have been updated successfully.",
    });
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Volume Discounts</h1>
          <p className="text-muted-foreground">
            Configure volume-based discounts for contracts and invoicing
          </p>
        </div>

        <div className="grid gap-6">
          {/* Annual Upfront Payment Discount */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Annual Upfront Payment Discount
              </CardTitle>
              <CardDescription>
                Discount applied when customers pay annually in advance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="annualUpfront">Discount Percentage</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="annualUpfront"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.annualUpfrontDiscount}
                    onChange={(e) => handleChange("annualUpfrontDiscount", e.target.value)}
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Site Size Discount */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Site Size Discount
              </CardTitle>
              <CardDescription>
                Discount applied for sites above a certain MW threshold
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="siteThreshold">Site Size Threshold (MW)</Label>
                <Input
                  id="siteThreshold"
                  type="number"
                  step="0.1"
                  min="0"
                  value={settings.siteSizeDiscountThreshold}
                  onChange={(e) => handleChange("siteSizeDiscountThreshold", e.target.value)}
                />
              </div>
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="siteDiscount">Discount Percentage</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="siteDiscount"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.siteSizeDiscount}
                    onChange={(e) => handleChange("siteSizeDiscount", e.target.value)}
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Portfolio Size Discounts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Portfolio Size Discounts
              </CardTitle>
              <CardDescription>
                Tiered discounts based on total portfolio MW capacity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="portfolio50">50 MW Portfolio Discount</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="portfolio50"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.portfolio50MW}
                      onChange={(e) => handleChange("portfolio50MW", e.target.value)}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="portfolio100">100 MW Portfolio Discount</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="portfolio100"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.portfolio100MW}
                      onChange={(e) => handleChange("portfolio100MW", e.target.value)}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="portfolio150">150 MW Portfolio Discount</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="portfolio150"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.portfolio150MW}
                      onChange={(e) => handleChange("portfolio150MW", e.target.value)}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="portfolio200">200+ MW Portfolio Discount</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="portfolio200"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.portfolio200MW}
                      onChange={(e) => handleChange("portfolio200MW", e.target.value)}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </div>
    </Layout>
  );
}
