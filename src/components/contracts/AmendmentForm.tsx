import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const amendmentFormSchema = z.object({
  effectiveDate: z.date().optional(),
  changesSummary: z.string().min(10, "Please provide at least 10 characters describing the changes"),
  newMw: z.string().optional(),
  newPeriodEnd: z.date().optional(),
  pricingNotes: z.string().optional(),
});

type AmendmentFormValues = z.infer<typeof amendmentFormSchema>;

interface AmendmentFormProps {
  contractId: string;
  nextAmendmentNumber: number;
  onComplete: () => void;
}

export default function AmendmentForm({
  contractId,
  nextAmendmentNumber,
  onComplete,
}: AmendmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contract, setContract] = useState<any>(null);
  const { toast } = useToast();

  const form = useForm<AmendmentFormValues>({
    resolver: zodResolver(amendmentFormSchema),
    defaultValues: {
      effectiveDate: undefined,
      changesSummary: "",
      newMw: "",
      newPeriodEnd: undefined,
      pricingNotes: "",
    },
  });

  useEffect(() => {
    loadContract();
  }, [contractId]);

  const loadContract = async () => {
    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (error) {
      toast({
        title: "Error loading contract",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setContract(data);
    // Pre-fill current values
    if (data) {
      form.setValue("newMw", data.initial_mw?.toString() || "");
      if (data.period_end) {
        form.setValue("newPeriodEnd", new Date(data.period_end));
      }
    }
  };

  const onSubmit = async (values: AmendmentFormValues) => {
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Prepare amendment data
      const amendmentData = {
        contract_id: contractId,
        user_id: user.id,
        amendment_number: nextAmendmentNumber,
        amendment_date: new Date().toISOString(),
        effective_date: values.effectiveDate?.toISOString() || null,
        changes_summary: values.changesSummary,
        pdf_url: null,
        ocr_status: "completed", // Manual amendments don't require OCR processing
        ocr_data: {
          new_mw: values.newMw || null,
          new_period_end: values.newPeriodEnd?.toISOString() || null,
          pricing_notes: values.pricingNotes || null,
        },
      };

      // Insert amendment record
      const { error: amendmentError } = await supabase
        .from("contract_amendments")
        .insert(amendmentData);

      if (amendmentError) throw amendmentError;

      // Prepare contract updates
      const contractUpdates: any = {
        updated_at: new Date().toISOString(),
      };

      if (values.newMw && values.newMw !== contract?.initial_mw?.toString()) {
        contractUpdates.initial_mw = parseFloat(values.newMw);
      }

      if (values.newPeriodEnd && values.newPeriodEnd !== new Date(contract?.period_end || "")) {
        contractUpdates.period_end = values.newPeriodEnd.toISOString();
      }

      // Update contract if there are changes
      if (Object.keys(contractUpdates).length > 1) {
        const { error: contractError } = await supabase
          .from("contracts")
          .update(contractUpdates)
          .eq("id", contractId);

        if (contractError) throw contractError;
      }

      toast({
        title: "Amendment saved successfully",
        description: "Contract has been updated with the amendment details.",
      });

      form.reset();
      onComplete();
    } catch (error: any) {
      console.error("Error saving amendment:", error);
      toast({
        title: "Error saving amendment",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!contract) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="changesSummary"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Changes Summary *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe what changed in this amendment (e.g., 'Increased MWp from 50 to 56, updated tier 1 pricing to €2.70/site')"
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Provide a clear summary of all changes made in this amendment
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="effectiveDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Effective Date (Optional)</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP")
                      ) : (
                        <span>Pick effective date</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormDescription>
                When does this amendment take effect?
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="newMw"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Updated MWp Managed</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Current: {contract.initial_mw}"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Current: {contract.initial_mw || "N/A"} MWp
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPeriodEnd"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>New Contract End Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick new end date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  Current: {contract.period_end ? format(new Date(contract.period_end), "PPP") : "N/A"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="pricingNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pricing Changes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe any pricing adjustments, new tiers, or module/addon changes"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Document any changes to pricing, modules, or addons
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={isSubmitting}
          >
            Clear
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Amendment"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
