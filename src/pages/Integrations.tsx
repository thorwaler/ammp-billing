
import Layout from "@/components/layout/Layout";
import AmmpIntegration from "@/components/integrations/AmmpIntegration";
import XeroIntegration from "@/components/integrations/XeroIntegration";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
            Connect AMMP Contract Compass with your favorite tools
          </p>
        </div>

        <Tabs defaultValue="ammp" className="w-full">
          <TabsList className="grid grid-cols-2 w-[400px] mb-4">
            <TabsTrigger value="ammp">AMMP Data API</TabsTrigger>
            <TabsTrigger value="xero">Xero</TabsTrigger>
          </TabsList>
          
          <TabsContent value="ammp" className="mt-0">
            <AmmpIntegration />
          </TabsContent>
          
          <TabsContent value="xero" className="mt-0">
            <XeroIntegration />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Integrations;
