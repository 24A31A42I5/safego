import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/AppShell";

export const Route = createFileRoute("/tourist")({
  component: TouristLayout,
});

function TouristLayout() {
  return (
    <ProtectedShell requireRole="tourist">
      <Outlet />
    </ProtectedShell>
  );
}