import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, FileText, User, DollarSign, Bell, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  action: string;
  target: string;
  timestamp: Date;
  icon: "contract" | "customer" | "invoice" | "notification";
  type: string;
}

const iconMap = {
  contract: <FileText className="h-4 w-4" />,
  customer: <User className="h-4 w-4" />,
  invoice: <DollarSign className="h-4 w-4" />,
  notification: <Bell className="h-4 w-4" />,
};

export function RecentActivity() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchActivities = async () => {
      try {
        // Fetch recent invoices with customer names
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, created_at, customers(name)")
          .order("created_at", { ascending: false })
          .limit(10);

        // Fetch recent contracts
        const { data: contracts } = await supabase
          .from("contracts")
          .select("id, created_at, company_name")
          .order("created_at", { ascending: false })
          .limit(10);

        // Fetch recent customers
        const { data: customers } = await supabase
          .from("customers")
          .select("id, created_at, name")
          .order("created_at", { ascending: false })
          .limit(10);

        // Fetch recent notifications
        const { data: notifications } = await supabase
          .from("notifications")
          .select("id, created_at, title, type")
          .order("created_at", { ascending: false })
          .limit(10);

        // Combine all activities
        const allActivities: ActivityItem[] = [];

        invoices?.forEach((invoice) => {
          const customerName = (invoice.customers as { name: string } | null)?.name || "Unknown";
          allActivities.push({
            id: `invoice-${invoice.id}`,
            action: "Generated invoice",
            target: customerName,
            timestamp: new Date(invoice.created_at!),
            icon: "invoice",
            type: "invoice",
          });
        });

        contracts?.forEach((contract) => {
          allActivities.push({
            id: `contract-${contract.id}`,
            action: "Created contract",
            target: contract.company_name,
            timestamp: new Date(contract.created_at),
            icon: "contract",
            type: "contract",
          });
        });

        customers?.forEach((customer) => {
          allActivities.push({
            id: `customer-${customer.id}`,
            action: "Added customer",
            target: customer.name,
            timestamp: new Date(customer.created_at),
            icon: "customer",
            type: "customer",
          });
        });

        notifications?.forEach((notification) => {
          allActivities.push({
            id: `notification-${notification.id}`,
            action: notification.title,
            target: notification.type.replace(/_/g, " "),
            timestamp: new Date(notification.created_at!),
            icon: "notification",
            type: "notification",
          });
        });

        // Sort by timestamp descending and take top 5 to align with Contract Management card
        allActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setActivities(allActivities.slice(0, 5));
      } catch (error) {
        console.error("Error fetching activities:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [user]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Activity className="h-5 w-5 text-ammp-blue" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-4">
                <div className="rounded-full p-2 bg-muted flex items-center justify-center">
                  {iconMap[activity.icon]}
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none truncate">
                    {activity.action}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{activity.target}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RecentActivity;
