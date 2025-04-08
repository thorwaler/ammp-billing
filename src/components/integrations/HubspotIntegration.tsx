
import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Link2, Check } from "lucide-react";

const HubspotIntegration = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [dealStage, setDealStage] = useState("closedwon");
  const [isEnabled, setIsEnabled] = useState(false);

  const handleConnect = () => {
    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your HubSpot API key to connect.",
        variant: "destructive",
      });
      return;
    }
    
    setIsConnecting(true);
    
    // Simulate API connection
    setTimeout(() => {
      setIsConnected(true);
      setIsConnecting(false);
      toast({
        title: "Connected to HubSpot",
        description: "Your HubSpot account has been successfully connected.",
      });
    }, 2000);
  };

  const handleSaveSettings = () => {
    toast({
      title: "Settings Saved",
      description: "Your HubSpot integration settings have been saved.",
    });
  };

  const handleEnableIntegration = (enabled: boolean) => {
    setIsEnabled(enabled);
    
    toast({
      title: enabled ? "Integration Enabled" : "Integration Disabled",
      description: enabled 
        ? "HubSpot integration is now active. New deals will create customers automatically." 
        : "HubSpot integration has been disabled.",
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 512 512" 
            className="h-6 w-6 mr-2 text-[#ff7a59]" 
            fill="currentColor"
          >
            <path d="M93.2 402.6V109.4c0-8.7-7.1-15.8-15.8-15.8H15.8c-8.7 0-15.8 7.1-15.8 15.8v293.2c0 8.7 7.1 15.8 15.8 15.8h61.6c8.7 0 15.8-7.1 15.8-15.8zm143.8 0V109.4c0-8.7-7.1-15.8-15.8-15.8h-61.6c-8.7 0-15.8 7.1-15.8 15.8v293.2c0 8.7 7.1 15.8 15.8 15.8h61.6c8.7 0 15.8-7.1 15.8-15.8zm144.8 0V109.4c0-8.7-7.1-15.8-15.8-15.8h-61.6c-8.7 0-15.8 7.1-15.8 15.8v293.2c0 8.7 7.1 15.8 15.8 15.8h61.6c8.7 0 15.8-7.1 15.8-15.8zm130.2 0V109.4c0-8.7-7.1-15.8-15.8-15.8h-61.6c-8.7 0-15.8 7.1-15.8 15.8v293.2c0 8.7 7.1 15.8 15.8 15.8H496c8.7 0 15.8-7.1 15.8-15.8z"/>
          </svg>
          HubSpot Integration
        </CardTitle>
        <CardDescription>
          Automatically create customers when deals reach specific stages in HubSpot
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!isConnected ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">HubSpot API Key</Label>
              <Input 
                id="api-key" 
                type="password" 
                placeholder="Enter your HubSpot API key" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                You can find your API key in your HubSpot account settings.
              </p>
            </div>
            
            <Button 
              onClick={handleConnect} 
              disabled={isConnecting} 
              className="w-full"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Connect to HubSpot
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Connected to HubSpot</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsConnected(false)}
              >
                Disconnect
              </Button>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="enable-integration" className="cursor-pointer">Enable Integration</Label>
                <Switch 
                  id="enable-integration" 
                  checked={isEnabled}
                  onCheckedChange={handleEnableIntegration}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                When enabled, new customers will be created automatically when deals reach the specified stage.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deal-stage">Deal Stage Trigger</Label>
              <Select 
                value={dealStage} 
                onValueChange={setDealStage}
                disabled={!isEnabled}
              >
                <SelectTrigger id="deal-stage">
                  <SelectValue placeholder="Select deal stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointmentscheduled">Appointment Scheduled</SelectItem>
                  <SelectItem value="qualifiedtobuy">Qualified to Buy</SelectItem>
                  <SelectItem value="presentationscheduled">Presentation Scheduled</SelectItem>
                  <SelectItem value="decisionmakerboughtin">Decision Maker Bought-In</SelectItem>
                  <SelectItem value="contractsent">Contract Sent</SelectItem>
                  <SelectItem value="closedwon">Closed Won</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Customers will be created when deals reach this stage in HubSpot.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Mapping</Label>
              <Card className="border border-muted">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-sm font-medium">HubSpot Field</div>
                    <div className="text-sm font-medium">AMMP Field</div>
                    
                    <div className="text-sm">Company Name</div>
                    <div className="text-sm">Company Name</div>
                    
                    <div className="text-sm">Deal Size</div>
                    <div className="text-sm">Initial MW</div>
                    
                    <div className="text-sm">Deal Owner</div>
                    <div className="text-sm">Account Manager</div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Button 
              onClick={handleSaveSettings} 
              disabled={!isEnabled}
              className="w-full"
            >
              <Check className="mr-2 h-4 w-4" />
              Save Integration Settings
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default HubspotIntegration;
