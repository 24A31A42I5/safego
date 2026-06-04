import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import heroMountains from "@/assets/hero-mountains.jpg";
import heroBeach from "@/assets/hero-beach.jpg";
import heroHeritage from "@/assets/hero-heritage.jpg";
import heroCity from "@/assets/hero-city.jpg";
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
  head: () => ({
    meta: [
      { title: "SafeGo — Your Guide to Safer Travels" },
      {
        name: "description",
        content:
          "Travel with confidence using SafeGo: blockchain Digital ID, real-time safety zones, SOS alerts, and offline maps.",
      },
      { property: "og:title", content: "SafeGo — Your Guide to Safer Travels" },
      {
        property: "og:description",
        content:
          "Blockchain Digital ID, real-time safety zones, SOS alerts, and offline maps for safer travel.",
      },
      { property: "og:url", content: "/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

const SLIDES = [
  { src: heroMountains, alt: "Mountain landscape at golden hour" },
  { src: heroBeach, alt: "Tropical beach with palm trees" },
  { src: heroHeritage, alt: "Heritage temple at sunset" },
  { src: heroCity, alt: "City skyline at blue hour" },
];

function HeroSlideshow() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {SLIDES.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt={s.alt}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
          loading={i === 0 ? "eager" : "lazy"}
        />
      ))}
      {/* Readability overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black/80" />
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/40 via-transparent to-transparent mix-blend-multiply" />
    </div>
  );
}

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
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
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
        <HeroSlideshow />
        <div
          className="relative mx-auto max-w-6xl px-4 py-28 text-center text-black md:py-36"
          style={{
            textShadow:
              "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
          }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-black backdrop-blur">
            <Shield className="h-3 w-3" /> Travel safer, together
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight text-black md:text-6xl">
            Your Guide to <span className="text-black underline decoration-black/40 underline-offset-8">Safer Travels</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-black md:text-lg">
            Navigate new places with confidence. SafeGo provides a secure Digital ID,
            real-time safety zones, group tours, and instant emergency alerts.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup">
              <Button
                size="lg"
                className="bg-white text-black shadow-xl hover:bg-white/90"
                style={{
                  textShadow:
                    "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
                }}
              >
                Create Your Digital ID
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button
                size="lg"
                variant="outline"
                className="border-black/50 bg-white/10 text-black backdrop-blur hover:bg-white/20"
                style={{
                  textShadow:
                    "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
                }}
              >
                Explore features
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
              title: "Group Tours & Live Tracking",
              desc: "Invite friends with a code, get admin approval, and track each other live during shared trips.",
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
