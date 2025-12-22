import { Layout } from "@/components/layout/Layout";
import ContractList from "@/components/contracts/ContractList";

const Contracts = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contracts</h1>
            <p className="text-muted-foreground">Manage all your contracts in one place</p>
          </div>
        </div>
        <ContractList />
      </div>
    </Layout>
  );
};

export default Contracts;
