import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { LogOut, Home, Siren, Map, UserSearch, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/department")({
  component: DeptLayout,
});

const navItems: { to: string; label: string; icon: typeof Home; exact?: boolean }[] = [
  { to: "/department", label: "Dashboard", icon: Home, exact: true },
  { to: "/department/sos", label: "SOS Reports", icon: Siren },
  { to: "/department/map", label: "Map Management", icon: Map },
  { to: "/department/lost", label: "Lost & Found", icon: UserSearch },
  { to: "/department/incidents", label: "Incidents", icon: AlertTriangle },
];

function DeptLayout() {
  const { profile, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!role) navigate({ to: "/login" });
    else if (role !== "department") navigate({ to: "/tourist" });
  }, [loading, role, navigate]);

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

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r bg-sidebar p-3 md:block">
        <div className="px-2 py-2">
          <Logo />
        </div>
        <nav className="mt-4 space-y-1">
          {navItems.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
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
      </aside>

      {/* Main */}
      <div className="flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur-md">
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{profile.full_name}</div>
              <div className="text-xs text-muted-foreground">{profile.department_type}</div>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-1 h-4 w-4" /> Logout
            </Button>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b bg-background p-2 md:hidden">
          {navItems.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-xs ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" /> {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto max-w-6xl p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
