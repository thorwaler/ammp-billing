
import Layout from "@/components/layout/Layout";
import HubspotIntegration from "@/components/integrations/HubspotIntegration";
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

        <Tabs defaultValue="xero" className="w-full">
          <TabsList className="grid grid-cols-2 w-[400px] mb-4">
            <TabsTrigger value="xero">Xero</TabsTrigger>
            <TabsTrigger value="hubspot">HubSpot</TabsTrigger>
          </TabsList>
          
          <TabsContent value="xero" className="mt-0">
            <XeroIntegration />
          </TabsContent>
          
          <TabsContent value="hubspot" className="mt-0">
            <HubspotIntegration />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Integrations;
