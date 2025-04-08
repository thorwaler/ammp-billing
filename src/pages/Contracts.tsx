
import { useState } from "react";
import Layout from "@/components/layout/Layout";
import ContractList from "@/components/contracts/ContractList";
import ContractForm from "@/components/contracts/ContractForm";
import { Button } from "@/components/ui/button";
import { FileText, PlusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const Contracts = () => {
  const [showContractForm, setShowContractForm] = useState(false);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center">
              <FileText className="h-8 w-8 mr-2 text-ammp-blue" />
              Contracts
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage customer contracts and extract key data
            </p>
          </div>
          <Dialog open={showContractForm} onOpenChange={setShowContractForm}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Contract
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Contract</DialogTitle>
              </DialogHeader>
              <ContractForm />
            </DialogContent>
          </Dialog>
        </div>

        <div>
          <ContractList />
        </div>
      </div>
    </Layout>
  );
};

export default Contracts;
