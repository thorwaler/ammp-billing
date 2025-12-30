import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Menu, LogOut, User } from 'lucide-react';
import { CurrencySwitcher } from "@/components/ui/currency-switcher";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { AmmpLogo } from "@/components/ui/ammp-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  toggleSidebar: () => void;
}

const Navbar = ({ toggleSidebar }: NavbarProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className="border-b border-border bg-card sticky top-0 z-10">
      <div className="container flex h-16 items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
          <Link to="/" className="flex items-center gap-3">
            <AmmpLogo size="default" />
            <span className="text-sm text-muted-foreground hidden sm:block">Revenue & Invoicing</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <CurrencySwitcher />
          <NotificationCenter />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <User className="h-5 w-5" />
                <span className="sr-only">User menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Account</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
