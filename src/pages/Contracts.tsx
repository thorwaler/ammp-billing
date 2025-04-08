
import Layout from "@/components/layout/Layout";
import ContractList from "@/components/contracts/ContractList";
import ContractUploader from "@/components/dashboard/ContractUploader";
import { Button } from "@/components/ui/button";
import { FileText, PlusCircle } from "lucide-react";

const Contracts = () => {
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
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Contract
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ContractUploader />
          </div>
          <div className="lg:col-span-2">
            <ContractList />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Contracts;
