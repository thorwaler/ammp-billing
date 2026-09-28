import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Check, X, Trash2, Bot, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDateCET } from "@/lib/dateUtils";
import { oneOffCostsTable, useContractOneOffCosts, type OneOffCost } from "@/lib/oneOffCosts";

interface Props {
  contractId: string;
  customerId: string;
  currency: string;
}

const STATUS_LABEL: Record<OneOffCost["status"], string> = {
  pending_approval: "Needs approval",
  pending: "Next invoice",
  invoiced: "Invoiced",
  dismissed: "Dismissed",
};

export function OneOffCostsCard({ contractId, customerId, currency }: Props) {
  const { costs, reload } = useContractOneOffCosts(contractId);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountCode, setAccountCode] = useState("1000");
  const [saving, setSaving] = useState(false);

  const fmt = (n: number, cur: string) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: cur || "EUR" }).format(n);

  const add = async () => {
    const value = Number(amount);
    if (!title.trim() || !(value > 0)) {
      toast({ title: "Enter a title and a positive amount", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await oneOffCostsTable().insert({
      contract_id: contractId,
      customer_id: customerId,
      title: title.trim(),
      description: description.trim() || null,
      amount: value,
      currency: currency || "EUR",
      account_code: accountCode,
      status: "pending",
      source: "manual",
      created_by: user?.id ?? null,
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not add cost", description: error.message, variant: "destructive" });
      return;
    }
    setOpen(false);
    setTitle(""); setDescription(""); setAmount(""); setAccountCode("1000");
    reload();
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await oneOffCostsTable().update(patch).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    reload();
  };

  const approve = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    update(id, { status: "pending", approved_by: user?.id ?? null, approved_at: new Date().toISOString() });
  };

  const remove = async (id: string) => {
    await oneOffCostsTable().delete().eq("id", id);
    reload();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2"><Receipt className="h-5 w-5" />One-Off Costs</CardTitle>
          <CardDescription>Extra charges flagged on the next invoice for this contract.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add cost</Button>
      </CardHeader>
      <CardContent>
        {costs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one-off costs yet.</p>
        ) : (
          <div className="divide-y">
            {costs.map((c) => (
              <div key={c.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.title}</span>
                    <Badge variant={c.status === "pending_approval" ? "destructive" : c.status === "pending" ? "default" : "secondary"}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                    {c.source === "mcp" && (
                      <Badge variant="outline" className="gap-1"><Bot className="h-3 w-3" />Slack agent</Badge>
                    )}
                    <Badge variant="outline">Acct {c.account_code}</Badge>
                  </div>
                  {c.description && <p className="text-sm text-muted-foreground mt-1">{c.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Added {formatDateCET(c.created_at, "MMM d, yyyy")}
                    {c.requested_by ? ` · requested by ${c.requested_by}` : ""}
                    {c.invoiced_at ? ` · invoiced ${formatDateCET(c.invoiced_at, "MMM d, yyyy")}` : ""}
                  </p>
                </div>
                <span className="font-semibold whitespace-nowrap">{fmt(Number(c.amount), c.currency)}</span>
                <div className="flex gap-1">
                  {c.status === "pending_approval" && (
                    <Button size="icon" variant="outline" title="Approve" onClick={() => approve(c.id)}><Check className="h-4 w-4" /></Button>
                  )}
                  {(c.status === "pending" || c.status === "pending_approval") && (
                    <Button size="icon" variant="outline" title="Dismiss" onClick={() => update(c.id, { status: "dismissed" })}><X className="h-4 w-4" /></Button>
                  )}
                  {c.status === "dismissed" && (
                    <Button size="icon" variant="ghost" title="Delete" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add one-off cost</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Emergency onsite sensor replacement" /></div>
            <div><Label>Notes</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount ({currency})</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div>
                <Label>Revenue type</Label>
                <Select value={accountCode} onValueChange={setAccountCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1000">1000 · Implementation (NRR)</SelectItem>
                    <SelectItem value="1002">1002 · Platform (ARR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={add} disabled={saving}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
