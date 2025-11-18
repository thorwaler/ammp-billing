
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
    location: existingCustomer?.location || "",
    mwpManaged: existingCustomer?.mwpManaged || "",
    status: existingCustomer?.status || "active",
    ammpOrgId: existingCustomer?.ammp_org_id || "",
    ammpAssetIds: existingCustomer?.ammp_asset_ids ? JSON.stringify(existingCustomer.ammp_asset_ids) : "",
  });

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

      let parsedAssetIds = [];
      if (formData.ammpAssetIds) {
        try {
          parsedAssetIds = JSON.parse(formData.ammpAssetIds);
        } catch (e) {
          toast({
            title: "Invalid Asset IDs",
            description: "Asset IDs must be a valid JSON array",
            variant: "destructive",
          });
          return;
        }
      }

      const customerData = {
        name: formData.name,
        location: formData.location,
        mwp_managed: formData.mwpManaged ? parseFloat(formData.mwpManaged) : 0,
        status: formData.status,
        ammp_org_id: formData.ammpOrgId || null,
        ammp_asset_ids: parsedAssetIds,
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
            <Label htmlFor="mwpManaged">Total MWp Managed</Label>
            <Input
              id="mwpManaged"
              name="mwpManaged"
              type="number"
              step="0.1"
              value={formData.mwpManaged}
              onChange={handleInputChange}
              placeholder="0.0"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="status">Customer Status</Label>
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
          </div>
        </div>

        {/* AMMP Integration Section */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          <h3 className="font-medium text-sm">AMMP Integration (Optional)</h3>
          
          <div className="space-y-2">
            <Label htmlFor="ammpOrgId">AMMP Organization ID</Label>
            <Input
              id="ammpOrgId"
              name="ammpOrgId"
              value={formData.ammpOrgId}
              onChange={handleInputChange}
              placeholder="e.g., org_abc123..."
            />
            <p className="text-xs text-muted-foreground">
              Link to AMMP for automatic MW and site data sync
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ammpAssetIds">AMMP Asset IDs (JSON array)</Label>
            <Textarea
              id="ammpAssetIds"
              name="ammpAssetIds"
              value={formData.ammpAssetIds}
              onChange={handleInputChange}
              placeholder='["uuid-1", "uuid-2"]'
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Paste asset UUIDs as JSON array (get from AMMP Integrations page)
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
