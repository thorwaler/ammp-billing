import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { SiteBillingItem } from "@/lib/invoiceCalculations";

interface SiteBillingSelectorProps {
  sites: SiteBillingItem[];
  selectedSites: SiteBillingItem[];
  onSelectionChange: (selected: SiteBillingItem[]) => void;
  onboardingFee: number;
  annualFee: number;
  currency: 'USD' | 'EUR';
}

export function SiteBillingSelector({
  sites,
  selectedSites,
  onSelectionChange,
  onboardingFee,
  annualFee,
  currency
}: SiteBillingSelectorProps) {
  const currencySymbol = currency === 'USD' ? '$' : '€';
  
  const handleToggle = (site: SiteBillingItem) => {
    const isSelected = selectedSites.some(s => s.assetId === site.assetId);
    if (isSelected) {
      onSelectionChange(selectedSites.filter(s => s.assetId !== site.assetId));
    } else {
      onSelectionChange([...selectedSites, site]);
    }
  };
  
  const handleSelectAll = () => {
    const sitesToBill = sites.filter(s => s.needsOnboarding || s.needsAnnualRenewal);
    onSelectionChange(sitesToBill);
  };
  
  const handleClearAll = () => {
    onSelectionChange([]);
  };
  
  // Calculate totals
  const totalOnboarding = selectedSites.filter(s => s.needsOnboarding).length * onboardingFee;
  const totalAnnual = selectedSites.filter(s => s.needsAnnualRenewal).length * annualFee;
  const totalAmount = totalOnboarding + totalAnnual;
  
  const sitesToBill = sites.filter(s => s.needsOnboarding || s.needsAnnualRenewal);
  
  if (sitesToBill.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">No sites due for billing this period.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Sites Due for Billing</CardTitle>
          <div className="flex gap-2">
            <button 
              onClick={handleSelectAll}
              className="text-sm text-primary hover:underline"
            >
              Select All
            </button>
            <span className="text-muted-foreground">|</span>
            <button 
              onClick={handleClearAll}
              className="text-sm text-muted-foreground hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Site Name</TableHead>
              <TableHead>Onboarding Date</TableHead>
              <TableHead>Billing Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sitesToBill.map((site) => {
              const isSelected = selectedSites.some(s => s.assetId === site.assetId);
              const siteAmount = (site.needsOnboarding ? onboardingFee : 0) + 
                                 (site.needsAnnualRenewal ? annualFee : 0);
              
              return (
                <TableRow 
                  key={site.assetId}
                  className={isSelected ? "bg-muted/50" : ""}
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggle(site)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{site.assetName}</TableCell>
                  <TableCell>
                    {site.onboardingDate 
                      ? format(new Date(site.onboardingDate), 'MMM d, yyyy')
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {site.needsOnboarding && (
                        <Badge variant="secondary" className="text-xs">
                          Onboarding
                        </Badge>
                      )}
                      {site.needsAnnualRenewal && (
                        <Badge variant="outline" className="text-xs">
                          Annual Renewal
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {currencySymbol}{siteAmount.toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        
        {/* Summary */}
        <div className="mt-4 pt-4 border-t space-y-2">
          {totalOnboarding > 0 && (
            <div className="flex justify-between text-sm">
              <span>Onboarding ({selectedSites.filter(s => s.needsOnboarding).length} sites × {currencySymbol}{onboardingFee})</span>
              <span className="font-mono">{currencySymbol}{totalOnboarding.toLocaleString()}</span>
            </div>
          )}
          {totalAnnual > 0 && (
            <div className="flex justify-between text-sm">
              <span>Annual Subscription ({selectedSites.filter(s => s.needsAnnualRenewal).length} sites × {currencySymbol}{annualFee})</span>
              <span className="font-mono">{currencySymbol}{totalAnnual.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold pt-2 border-t">
            <span>Total Site Fees</span>
            <span className="font-mono">{currencySymbol}{totalAmount.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
