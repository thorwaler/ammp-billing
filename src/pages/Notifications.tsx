import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Bell, CheckCheck } from 'lucide-react';

const Notifications = () => {
  const { notifications, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'read') return n.is_read;
    return true;
  });

  const groupedNotifications = filteredNotifications.reduce((acc, notification) => {
    const date = new Date(notification.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let key: string;
    if (date.toDateString() === today.toDateString()) {
      key = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = 'Yesterday';
    } else {
      key = 'Earlier';
    }

    if (!acc[key]) acc[key] = [];
    acc[key].push(notification);
    return acc;
  }, {} as Record<string, typeof notifications>);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground mt-1">
              Stay updated with your contract and invoice alerts
            </p>
          </div>
          
          {notifications.some(n => !n.is_read) && (
            <Button onClick={markAllAsRead} variant="outline">
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark All as Read
            </Button>
          )}
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">
              All ({notifications.length})
            </TabsTrigger>
            <TabsTrigger value="unread">
              Unread ({notifications.filter(n => !n.is_read).length})
            </TabsTrigger>
            <TabsTrigger value="read">
              Read ({notifications.filter(n => n.is_read).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="space-y-4 mt-4">
            {filteredNotifications.length > 0 ? (
              <Card className="p-6">
                <div className="space-y-6">
                  {Object.entries(groupedNotifications).map(([period, notifs]) => (
                    <div key={period}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                        {period}
                      </h3>
                      <div className="space-y-2">
                        {notifs.map((notification) => (
                          <NotificationItem
                            key={notification.id}
                            notification={notification}
                            onMarkAsRead={markAsRead}
                            onDelete={deleteNotification}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <Bell className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No notifications</h3>
                  <p className="text-muted-foreground">
                    {filter === 'unread' 
                      ? "You're all caught up!"
                      : "You don't have any notifications yet."}
                  </p>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Notifications;
