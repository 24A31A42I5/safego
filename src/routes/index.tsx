import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Shield,
  MapPin,
  Bell,
  Download,
  Users,
  Compass,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role === "tourist") navigate({ to: "/tourist" });
    if (!loading && role === "department") navigate({ to: "/department" });
  }, [role, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <a href="#features" className="text-muted-foreground hover:text-foreground">
              Features
            </a>
            <a href="#how" className="text-muted-foreground hover:text-foreground">
              How It Works
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Sign Up</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.55 0.18 250) 0%, oklch(0.40 0.20 270) 50%, oklch(0.30 0.15 240) 100%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-4 py-24 text-center text-white">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
            Your Guide to Safer Travels
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-white/85 md:text-lg">
            Navigate new places with confidence. SafeGo provides a secure Digital ID,
            real-time safety zones, and instant emergency alerts.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90">
                Create Your Digital ID
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button
                size="lg"
                variant="outline"
                className="border-white/40 bg-white/10 text-white hover:bg-white/20"
              >
                Learn More
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Navigate Your World, Safer</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            SafeGo is packed with powerful features to ensure you're always protected,
            informed, and in control.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "Interactive Safety Zones",
              desc: "Visualize the inner safe, caution, and danger zones on an interactive map to navigate with assurance.",
            },
            {
              icon: Shield,
              title: "Blockchain Digital ID",
              desc: "Carry a secure verifiable digital identity for enhanced safety and trust.",
            },
            {
              icon: Bell,
              title: "Instant SOS Alerts",
              desc: "A single tap on the SOS button sends your location and digital ID to authorities and personal contacts.",
            },
            {
              icon: Download,
              title: "Offline Map Access",
              desc: "Download maps and safety data so they're available even in areas with no internet connectivity.",
            },
            {
              icon: Compass,
              title: "Geofenced Alerts",
              desc: "Receive automatic alerts and safety advice when you enter a caution or danger zone.",
            },
            {
              icon: Users,
              title: "Multi-Agency Coordination",
              desc: "Seamlessly connect with police, medical, and tourist services through a single, unified platform.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="bg-muted/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Your Secure Digital Identity</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Follow our simple, secure process to create a blockchain-verified Digital ID
              for enhanced travel safety.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["1. Select Your Role", "Tell us if you're a tourist or a department to tailor your experience."],
              ["2. Generate Digital ID", "Create a unique secure Digital ID that lets you skip standing in line."],
              ["3. Create Your Account", "Complete your registration in less than two minutes with your details."],
              ["4. Travel with Confidence", "Use your Digital ID across all of SafeGo's features and travel safer."],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-sm text-muted-foreground">
          <Logo />
          <p>© {new Date().getFullYear()} SafeGo. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
