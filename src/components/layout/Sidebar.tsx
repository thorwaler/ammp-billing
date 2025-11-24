
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { NavLink } from "react-router-dom";
import { Home, Users, FileText, BarChart, Link2, UserCircle, X, History } from "lucide-react";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  closeSidebar: () => void;
}

export function Sidebar({ className, isOpen, closeSidebar }: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-20 flex w-72 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-300 md:relative",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        className
      )}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <Button variant="ghost" size="icon" className="md:hidden absolute right-4" onClick={closeSidebar}>
          <X className="h-5 w-5" />
          <span className="sr-only">Close sidebar</span>
        </Button>
      </div>
      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="flex flex-col gap-1">
          <NavLink 
            to="/" 
            className={({ isActive }) => 
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <Home className="h-5 w-5" />
            Dashboard
          </NavLink>
          <NavLink 
            to="/customers" 
            className={({ isActive }) => 
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <Users className="h-5 w-5" />
            Customers
          </NavLink>
          <NavLink 
            to="/invoices" 
            className={({ isActive }) => 
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <FileText className="h-5 w-5" />
            Invoices
          </NavLink>
          <NavLink 
            to="/invoice-history" 
            className={({ isActive }) => 
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <History className="h-5 w-5" />
            Invoice History
          </NavLink>
          <NavLink 
            to="/reports"
            className={({ isActive }) => 
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <BarChart className="h-5 w-5" />
            Reports
          </NavLink>
          <NavLink 
            to="/integrations" 
            className={({ isActive }) => 
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <Link2 className="h-5 w-5" />
            Integrations
          </NavLink>
          <NavLink 
            to="/users"
            className={({ isActive }) => 
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <UserCircle className="h-5 w-5" />
            Users
          </NavLink>
        </nav>
      </ScrollArea>
    </aside>
  );
}

export default Sidebar;
