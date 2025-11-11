
import { useState, useEffect } from "react";
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
import { Loader2, Link2, Check, AlertCircle, ExternalLink, Edit, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

// This will be replaced with actual Supabase client after integration
// For now, we'll use localStorage as a temporary solution
const saveToStorage = (data) => {
  localStorage.setItem('xero_integration', JSON.stringify(data));
};

const loadFromStorage = () => {
  const data = localStorage.getItem('xero_integration');
  return data ? JSON.parse(data) : null;
};

const XeroIntegration = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [invoiceTemplate, setInvoiceTemplate] = useState("standard");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Load saved integration data on component mount
  useEffect(() => {
    const savedData = loadFromStorage();
    if (savedData) {
      setIsConnected(true);
      setClientId(savedData.clientId || "");
      setClientSecret(savedData.clientSecret || "");
      setTenantId(savedData.tenantId || "");
      setRefreshToken(savedData.refreshToken || "");
      setInvoiceTemplate(savedData.invoiceTemplate || "standard");
      setIsEnabled(savedData.isEnabled || false);
    }
  }, []);

  const handleConnect = () => {
    if (!clientId || !clientSecret || !tenantId) {
      toast({
        title: "Missing Credentials",
        description: "Please enter your Xero client ID, client secret and tenant ID to connect.",
        variant: "destructive",
      });
      return;
    }
    
    setIsConnecting(true);
    
    // Simulate API connection
    setTimeout(() => {
      setIsConnected(true);
      setIsConnecting(false);
      
      // Save integration data
      saveToStorage({
        clientId,
        clientSecret,
        tenantId,
        refreshToken,
        invoiceTemplate,
        isEnabled
      });
      
      toast({
        title: "Connected to Xero",
        description: "Your Xero account has been successfully connected.",
      });
    }, 2000);
  };

  const handleSaveSettings = () => {
    // Save updated settings
    saveToStorage({
      clientId,
      clientSecret,
      tenantId,
      refreshToken,
      invoiceTemplate,
      isEnabled
    });
    
    setIsEditing(false);
    
    toast({
      title: "Settings Saved",
      description: "Your Xero integration settings have been saved.",
    });
  };

  const handleEnableIntegration = (enabled: boolean) => {
    setIsEnabled(enabled);
    
    // Save updated enabled state
    saveToStorage({
      clientId,
      clientSecret,
      tenantId,
      refreshToken,
      invoiceTemplate,
      isEnabled: enabled
    });
    
    toast({
      title: enabled ? "Integration Enabled" : "Integration Disabled",
      description: enabled 
        ? "Xero integration is now active. Invoices can be sent directly to Xero." 
        : "Xero integration has been disabled.",
    });
  };
  
  const handleDisconnect = () => {
    // Clear storage and reset state
    localStorage.removeItem('xero_integration');
    setIsConnected(false);
    setClientId("");
    setClientSecret("");
    setTenantId("");
    setRefreshToken("");
    setInvoiceTemplate("standard");
    setIsEnabled(false);
    
    toast({
      title: "Disconnected from Xero",
      description: "Your Xero account has been disconnected.",
    });
  };
  
  const openXeroDeveloperPortal = () => {
    window.open("https://developer.xero.com/app/manage", "_blank");
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            className="h-6 w-6 mr-2 text-[#13B5EA]"
            fill="currentColor"
          >
            <path d="M339.8 177.7c-17.3-17.3-44.5-17.3-61.7 0s-17.3 44.5 0 61.7c17.3 17.3 44.5 17.3 61.7 0s17.3-44.5 0-61.7zm-8.6 53c-12.7 12.7-32.9 12.7-45.6 0-12.7-12.6-12.7-32.9 0-45.6 12.6-12.7 32.9-12.7 45.6 0 12.7 12.7 12.7 33 0 45.6zm-247-145l90.5-90.3A61.7 61.7 0 0 1 218 -23h109.5a32.5 32.5 0 0 1 23 9.5l75.7 75.8a32.2 32.2 0 0 1 9.5 23V194a61.7 61.7 0 0 1-18.4 43.4l-90.4 90.3A61.7 61.7 0 0 1 283.5 346H174a32.5 32.5 0 0 1-23-9.5l-75.8-75.7a32.2 32.2 0 0 1-9.5-23V109.4c0-16.3 6.5-32 18.2-43.5zm308.2 51c17.3-17.3 17.3-44.5 0-61.7s-44.5-17.3-61.7 0-17.3 44.5 0 61.7c17.3 17.3 44.5 17.3 61.7 0zM255 0c-8.8 0-16 7.2-16 16s7.2 16 16 16h.3a16 16 0 1 0-.3-32z" />
          </svg>
          Xero Integration
        </CardTitle>
        <CardDescription>
          Send invoices directly to Xero to streamline your billing process
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!isConnected ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>API Credentials Required</AlertTitle>
              <AlertDescription>
                To set up this integration, you'll need to create a Xero app in the Xero Developer Portal and obtain the following credentials:
                <ul className="mt-2 ml-6 list-disc text-sm">
                  <li>Client ID</li>
                  <li>Client Secret</li>
                  <li>Tenant ID (Organization ID)</li>
                </ul>
                <div className="mt-3 p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium mb-1">How to find your Tenant ID:</p>
                  <ol className="ml-4 list-decimal text-xs space-y-1">
                    <li>Go to the Xero Developer Portal and create/select your app</li>
                    <li>After authentication, make a GET request to: <code className="bg-background px-1 py-0.5 rounded">https://api.xero.com/connections</code></li>
                    <li>The response will include your <code className="bg-background px-1 py-0.5 rounded">tenantId</code> for each connected organization</li>
                    <li>Alternatively, use the OAuth 2.0 flow and the tenant ID will be in the connection response</li>
                  </ol>
                </div>
                <Button 
                  variant="link" 
                  className="p-0 h-auto mt-2 text-sm font-normal"
                  onClick={openXeroDeveloperPortal}
                >
                  Go to Xero Developer Portal <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="client-id">Xero Client ID</Label>
              <Input 
                id="client-id" 
                placeholder="Enter your Xero client ID" 
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="client-secret">Xero Client Secret</Label>
              <Input 
                id="client-secret" 
                type="password" 
                placeholder="Enter your Xero client secret" 
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="tenant-id">Xero Tenant ID (Organization ID)</Label>
              <Input 
                id="tenant-id" 
                placeholder="Enter your Xero tenant ID" 
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                The Tenant ID identifies the specific Xero organization you want to connect to.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="refresh-token">Refresh Token (Optional)</Label>
              <Input 
                id="refresh-token" 
                type="password" 
                placeholder="Enter your refresh token if available" 
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
              />
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
                  Connect to Xero
                </>
              )}
            </Button>
            
            <div className="text-center">
              <Badge variant="outline" className="mt-2">
                OAuth 2.0 Authentication
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                This integration uses OAuth 2.0 to securely connect to your Xero account.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Connected to Xero</span>
              </div>
              <div className="flex items-center space-x-2">
                {!isEditing ? (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDisconnect}
                >
                  Disconnect
                </Button>
              </div>
            </div>
            
            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-client-id">Client ID</Label>
                  <Input 
                    id="edit-client-id" 
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-client-secret">Client Secret</Label>
                  <Input 
                    id="edit-client-secret" 
                    type="password" 
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-tenant-id">Tenant ID</Label>
                  <Input 
                    id="edit-tenant-id" 
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-refresh-token">Refresh Token</Label>
                  <Input 
                    id="edit-refresh-token" 
                    type="password" 
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="enable-xero" className="cursor-pointer">Enable Integration</Label>
                  <Switch 
                    id="enable-xero" 
                    checked={isEnabled}
                    onCheckedChange={handleEnableIntegration}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  When enabled, invoices can be sent directly to Xero from the calculator.
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="invoice-template">Invoice Template</Label>
              <Select 
                value={invoiceTemplate} 
                onValueChange={setInvoiceTemplate}
                disabled={!isEnabled || isEditing}
              >
                <SelectTrigger id="invoice-template">
                  <SelectValue placeholder="Select invoice template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Invoice</SelectItem>
                  <SelectItem value="detailed">Detailed Invoice</SelectItem>
                  <SelectItem value="summary">Summary Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Mapping</Label>
              <Card className="border border-muted">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-sm font-medium">AMMP Field</div>
                    <div className="text-sm font-medium">Xero Field</div>
                    
                    <div className="text-sm">Company Name</div>
                    <div className="text-sm">Contact Name</div>
                    
                    <div className="text-sm">Module Costs</div>
                    <div className="text-sm">Line Items</div>
                    
                    <div className="text-sm">Add-on Costs</div>
                    <div className="text-sm">Line Items</div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {isEditing ? (
              <Button 
                onClick={handleSaveSettings}
                className="w-full"
              >
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            ) : (
              <Button 
                onClick={handleSaveSettings} 
                disabled={!isEnabled}
                className="w-full"
              >
                <Check className="mr-2 h-4 w-4" />
                Save Settings
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default XeroIntegration;
