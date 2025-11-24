import { AlertCircle, CheckCircle, Info, Trash2, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '@/hooks/useNotifications';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

export const NotificationItem = ({
  notification,
  onMarkAsRead,
  onDelete,
}: NotificationItemProps) => {
  const navigate = useNavigate();

  const getSeverityIcon = () => {
    switch (notification.severity) {
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
    if (notification.contract_id) {
      navigate(`/contracts/${notification.contract_id}`);
    }
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
        notification.is_read
          ? 'bg-background hover:bg-accent/50'
          : 'bg-accent/20 hover:bg-accent/30'
      }`}
      onClick={handleClick}
    >
      <div className="flex-shrink-0 mt-1">{getSeverityIcon()}</div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium">{notification.title}</h4>
          {!notification.is_read && (
            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary" />
          )}
        </div>
        
        <p className="text-sm text-muted-foreground mt-1">
          {notification.message}
        </p>
        
        <p className="text-xs text-muted-foreground mt-2">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(notification.id);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
