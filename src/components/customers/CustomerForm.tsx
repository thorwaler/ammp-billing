import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CustomerFormProps {
  onComplete: () => void;
  existingCustomer?: any;
}

const CustomerForm = ({ onComplete, existingCustomer }: CustomerFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: existingCustomer?.name || "",
    nickname: existingCustomer?.nickname || "",
    location: existingCustomer?.location || "",
    mwpManaged: existingCustomer?.mwpManaged || "",
    status: existingCustomer?.status || "active",
    taxCategory: existingCustomer?.taxCategory || "non_eu",
  });
  
  // Track original status to detect manual changes
  const [originalStatus] = useState(existingCustomer?.status || "active");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.location) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if status was manually changed
      const statusChanged = existingCustomer && formData.status !== originalStatus;
      
      const customerData = {
        name: formData.name,
        nickname: formData.nickname || null,
        location: formData.location,
        mwp_managed: formData.mwpManaged ? parseFloat(formData.mwpManaged) : 0,
        status: formData.status,
        // Set manual_status_override to true if status was manually changed
        manual_status_override: statusChanged ? true : (existingCustomer?.manual_status_override || false),
        tax_category: formData.taxCategory,
        user_id: user.id,
      };

      if (existingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', existingCustomer.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([customerData]);

        if (error) throw error;
      }

      toast({
        title: existingCustomer ? "Customer Updated" : "Customer Created",
        description: `${formData.name} has been successfully ${existingCustomer ? "updated" : "added"}.`,
      });
      onComplete();
    } catch (error) {
      console.error('Error saving customer:', error);
      toast({
        title: "Error",
        description: "Failed to save customer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-2">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Customer Name*</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Enter customer name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nickname">Display Name / Nickname (optional)</Label>
            <Input
              id="nickname"
              name="nickname"
              value={formData.nickname}
              onChange={handleInputChange}
              placeholder="e.g., UNHCR (shown in dashboards instead of official name)"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="location">Location*</Label>
            <Input
              id="location"
              name="location"
              value={formData.location}
              onChange={handleInputChange}
              placeholder="City, Country"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="mwpManaged">Total MWp Managed (Read-only)</Label>
            <Input
              id="mwpManaged"
              name="mwpManaged"
              type="number"
              step="0.1"
              value={formData.mwpManaged}
              onChange={handleInputChange}
              placeholder="0.0"
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              MWp is automatically calculated from contract AMMP sync data
            </p>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="status">Customer Status</Label>
              {existingCustomer?.manual_status_override && (
                <Badge variant="outline" className="text-xs">
                  Manually managed
                </Badge>
              )}
            </div>
            <Select 
              value={formData.status}
              onValueChange={(value) => handleSelectChange("status", value)}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {formData.status !== originalStatus && (
              <p className="text-xs text-muted-foreground">
                Status will be manually managed (Xero sync won't change it)
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="taxCategory">Tax Category (for Xero)</Label>
            <Select 
              value={formData.taxCategory}
              onValueChange={(value) => handleSelectChange("taxCategory", value)}
            >
              <SelectTrigger id="taxCategory">
                <SelectValue placeholder="Select tax category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="non_eu">Non-EU (Zero Rated)</SelectItem>
                <SelectItem value="eu">EU (Reverse Charge)</SelectItem>
                <SelectItem value="tax_exempt">Tax Exempt (UN/Intl Orgs)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Determines the tax type applied to Xero invoices
            </p>
          </div>
        </div>

        <div className="pt-2">
          <Button 
            className="w-full"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {existingCustomer ? "Updating..." : "Creating..."}
              </>
            ) : existingCustomer ? "Update Customer" : "Add Customer"}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default CustomerForm;
