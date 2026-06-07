import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { ChatWidget } from "@/components/ChatWidget";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SafeGo — Tourist Safety Platform" },
      {
        name: "description",
        content:
          "SafeGo provides a secure Digital ID, real-time safety zones, and instant emergency alerts for safer travel.",
      },
      { property: "og:site_name", content: "SafeGo" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "SafeGo — Tourist Safety Platform" },
      {
        property: "og:description",
        content:
          "Secure Digital ID, real-time safety zones, and instant emergency alerts for safer travel.",
      },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "SafeGo — Tourist Safety Platform" },
      { name: "description", content: "SafeGo provides real-time safety monitoring and emergency assistance for tourists and departments." },
      { property: "og:description", content: "SafeGo provides real-time safety monitoring and emergency assistance for tourists and departments." },
      { name: "twitter:description", content: "SafeGo provides real-time safety monitoring and emergency assistance for tourists and departments." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0661e18c-60b1-46a6-a64a-23e7536e988b/id-preview-415016d0--26436944-6a2d-4bf2-823e-974494b3df3d.lovable.app-1780384056722.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0661e18c-60b1-46a6-a64a-23e7536e988b/id-preview-415016d0--26436944-6a2d-4bf2-823e-974494b3df3d.lovable.app-1780384056722.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "SafeGo",
              description: "Tourist safety platform with Digital ID, safety zones, and SOS alerts.",
            },
            {
              "@type": "WebSite",
              name: "SafeGo",
              description: "Your Guide to Safer Travels.",
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <ChatWidget />
      <Toaster richColors position="top-center" />
    </AuthProvider>
  );
}
