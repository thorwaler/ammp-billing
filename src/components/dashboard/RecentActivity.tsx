
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, FileText, User, DollarSign, CheckCircle } from "lucide-react";

interface ActivityItem {
  id: number;
  action: string;
  target: string;
  timestamp: string;
  icon: "contract" | "customer" | "invoice" | "approval";
}

const activities: ActivityItem[] = [
  {
    id: 1,
    action: "Uploaded contract",
    target: "Solaris Energy",
    timestamp: "2 hours ago",
    icon: "contract",
  },
  {
    id: 2,
    action: "Added customer",
    target: "SunPeak Solar",
    timestamp: "Yesterday",
    icon: "customer",
  },
  {
    id: 3,
    action: "Generated invoice",
    target: "Solar Universe Inc.",
    timestamp: "2 days ago",
    icon: "invoice",
  },
  {
    id: 4,
    action: "Approved contract",
    target: "GreenPower Systems",
    timestamp: "3 days ago",
    icon: "approval",
  },
];

const iconMap = {
  contract: <FileText className="h-4 w-4" />,
  customer: <User className="h-4 w-4" />,
  invoice: <DollarSign className="h-4 w-4" />,
  approval: <CheckCircle className="h-4 w-4" />,
};

export function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Activity className="h-5 w-5 text-ammp-blue" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-4">
              <div className="rounded-full p-2 bg-muted flex items-center justify-center">
                {iconMap[activity.icon]}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">
                  {activity.action}
                </p>
                <p className="text-sm text-muted-foreground">{activity.target}</p>
                <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default RecentActivity;
