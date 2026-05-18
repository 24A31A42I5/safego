import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tourist/groups")({
  head: () => ({
    meta: [
      { title: "Group Tours — SafeGo" },
      { name: "description", content: "Group tour planning and live tracking in SafeGo." },
      { property: "og:title", content: "Group Tours — SafeGo" },
      { property: "og:description", content: "Group tour planning and live tracking in SafeGo." },
      { property: "og:url", content: "/tourist/groups" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/tourist/groups" }],
  }),
  component: Outlet,
});