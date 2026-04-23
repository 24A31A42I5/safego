import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tourist/groups")({
  component: Outlet,
});