import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function AppHeader() {
  const { profile, role, signOut, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !profile) navigate({ to: "/login" });
  }, [loading, profile, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link to={role === "department" ? "/department" : "/tourist"}>
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          {profile && (
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{profile.full_name}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {profile.digital_id}
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-1 h-4 w-4" /> Logout
          </Button>
        </div>
      </div>
    </header>
  );
}

export function ProtectedShell({
  children,
  requireRole,
}: {
  children: ReactNode;
  requireRole?: "tourist" | "department";
}) {
  const { loading, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!role) {
      navigate({ to: "/login" });
      return;
    }
    if (requireRole && role !== requireRole) {
      navigate({ to: role === "tourist" ? "/tourist" : "/department" });
    }
  }, [loading, role, requireRole, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!role) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
