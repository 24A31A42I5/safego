import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LogOut, Home, Users, Menu } from "lucide-react";

export const Route = createFileRoute("/tourist")({
  component: TouristLayout,
});

const navItems: { to: string; label: string; icon: typeof Home; exact?: boolean }[] = [
  { to: "/tourist", label: "Dashboard", icon: Home, exact: true },
  { to: "/tourist/groups", label: "Group Tours", icon: Users },
];

function TouristLayout() {
  const { profile, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!role) navigate({ to: "/login" });
    else if (role !== "tourist") navigate({ to: "/department" });
  }, [loading, role, navigate]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const NavList = ({ onClick }: { onClick?: () => void }) => (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active = item.exact
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onClick}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      <aside className="hidden w-56 shrink-0 border-r bg-sidebar p-3 md:block">
        <div className="px-2 py-2">
          <Logo />
        </div>
        <div className="mt-4">
          <NavList />
        </div>
      </aside>

      <div className="flex w-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/80 px-3 py-3 backdrop-blur-md sm:px-4">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-3">
                <SheetHeader className="mb-4">
                  <SheetTitle className="text-left">
                    <Logo />
                  </SheetTitle>
                </SheetHeader>
                <NavList onClick={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="md:hidden">
              <Logo />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{profile.full_name}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {profile.digital_id}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>

        <main className="w-full min-w-0 flex-1 p-3 sm:p-4">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
