import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAmmpConnection } from '@/hooks/useAmmpConnection'
import { Database, Power, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react'

export default function AmmpIntegration() {
  const { isConnected, isConnecting, assets, error, testConnection, disconnect } = useAmmpConnection()

  const isCookieAuthEnvironment = window.location.origin.includes('os.ammp.io') || 
                                  window.location.origin.includes('os.stage.ammp.io') || 
                                  window.location.origin.includes('localhost:8080')

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle>AMMP Data API</CardTitle>
            </div>
            <Badge variant={isConnected ? 'default' : 'secondary'}>
              {isConnected ? (
                <><CheckCircle2 className="mr-1 h-3 w-3" /> Connected</>
              ) : (
                <><XCircle className="mr-1 h-3 w-3" /> Not Connected</>
              )}
            </Badge>
          </div>
          <CardDescription>
            Fetch real-time asset data, MW capacity, and device capabilities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Authentication Info */}
          {!isConnected && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="space-y-1">
                {isCookieAuthEnvironment ? (
                  <p className="text-muted-foreground">
                    Authentication uses your AMMP OS session. Make sure you're logged in to AMMP OS.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    You'll be prompted to enter your API key when connecting. Get your API key from AMMP OS Settings → API Access.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            {!isConnected ? (
              <Button 
                onClick={testConnection} 
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
                ) : (
                  <>Connect to AMMP API</>
                )}
              </Button>
            ) : (
              <>
                <Button onClick={testConnection} disabled={isConnecting} variant="outline">
                  {isConnecting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                  ) : (
                    <>Test Connection</>
                  )}
                </Button>
                <Button onClick={disconnect} variant="destructive">
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Assets Card */}
      {isConnected && assets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Power className="h-5 w-5" />
              Available Assets ({assets.length})
            </CardTitle>
            <CardDescription>
              Assets accessible through the AMMP Data API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {assets.map((asset) => (
                <div key={asset.asset_id} className="p-3 border rounded-md flex items-center justify-between">
                  <div>
                    <p className="font-medium">{asset.asset_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {asset.total_pv_power ? 
                        `${(asset.total_pv_power / 1_000_000).toFixed(2)} MW` : 
                        'Capacity unknown'
                      }
                      {asset.place && ` • ${asset.place}`}
                    </p>
                  </div>
                  <Badge variant="outline">{asset.asset_id.substring(0, 8)}...</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
