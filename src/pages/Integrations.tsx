import Layout from "@/components/layout/Layout";
import XeroIntegration from "@/components/integrations/XeroIntegration";
import AmmpIntegration from "@/components/integrations/AmmpIntegration";
import { Link2 } from "lucide-react";

const Integrations = () => {
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center">
            <Link2 className="h-8 w-8 mr-2 text-ammp-blue" />
            Integrations
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect AMMP Revenue & Invoicing with your favorite tools
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <XeroIntegration />
          <AmmpIntegration />
        </div>
      </div>
    </Layout>
  );
};

export default Integrations;
