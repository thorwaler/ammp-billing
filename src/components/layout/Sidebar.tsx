import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { NavLink } from "react-router-dom";
import { Home, Users, FileText, BarChart, Link2, UserCircle, X, History, ScrollText, AlertTriangle } from "lucide-react";
import { useInvoiceAlerts } from "@/hooks/useInvoiceAlerts";
import { AmmpLogo } from "@/components/ui/ammp-logo";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  closeSidebar: () => void;
}

export function Sidebar({ className, isOpen, closeSidebar }: SidebarProps) {
  const { unacknowledgedCount, criticalCount } = useInvoiceAlerts();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors relative",
      isActive
        ? "bg-primary/10 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:bg-primary before:rounded-full"
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-20 flex w-72 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 md:relative",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        className
      )}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <AmmpLogo size="default" />
        <Button variant="ghost" size="icon" className="md:hidden absolute right-4 text-sidebar-foreground hover:bg-sidebar-accent" onClick={closeSidebar}>
          <X className="h-5 w-5" />
          <span className="sr-only">Close sidebar</span>
        </Button>
      </div>
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          <NavLink to="/" className={navLinkClass}>
            <Home className="h-5 w-5" />
            Dashboard
          </NavLink>
          <NavLink to="/customers" className={navLinkClass}>
            <Users className="h-5 w-5" />
            Customers
          </NavLink>
          <NavLink to="/contracts" className={navLinkClass}>
            <ScrollText className="h-5 w-5" />
            Contracts
          </NavLink>
          <NavLink to="/invoices" className={navLinkClass}>
            <FileText className="h-5 w-5" />
            Invoices
          </NavLink>
          <NavLink to="/invoice-history" className={navLinkClass}>
            <History className="h-5 w-5" />
            Invoice History
          </NavLink>
          <NavLink 
            to="/alerts" 
            className={({ isActive }) => 
              cn(
                "flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors relative",
                isActive
                  ? "bg-primary/10 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:bg-primary before:rounded-full"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className={cn("h-5 w-5", criticalCount > 0 && "text-destructive")} />
              Alerts
            </div>
            {unacknowledgedCount > 0 && (
              <span className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium",
                criticalCount > 0 
                  ? "bg-destructive text-destructive-foreground" 
                  : "bg-amber-500 text-white"
              )}>
                {unacknowledgedCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/reports" className={navLinkClass}>
            <BarChart className="h-5 w-5" />
            Reports
          </NavLink>
          <NavLink to="/integrations" className={navLinkClass}>
            <Link2 className="h-5 w-5" />
            Integrations
          </NavLink>
          <NavLink to="/users" className={navLinkClass}>
            <UserCircle className="h-5 w-5" />
            Users
          </NavLink>
        </nav>
      </ScrollArea>
    </aside>
  );
}

export default Sidebar;
