import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { generateDigitalId } from "@/lib/digital-id";
import { User, Building2, ArrowRight, Check } from "lucide-react";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Account — SafeGo" },
      { name: "description", content: "Sign up for SafeGo to generate a secure Digital ID and travel with safety alerts and SOS." },
      { property: "og:title", content: "Create Account — SafeGo" },
      { property: "og:description", content: "Sign up for SafeGo to generate a secure Digital ID and travel with safety alerts and SOS." },
      { property: "og:url", content: "/signup" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/signup" }],
  }),
  component: Signup,
});

type Role = "tourist" | "department";

const baseSchema = z.object({
  full_name: z.string().trim().min(1, "Name required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(1, "Password required").max(128),
  phone: z.string().trim().min(1).max(30),
});

const touristSchema = baseSchema.extend({
  emergency_contact: z.string().trim().min(1).max(30),
});

const deptSchema = baseSchema.extend({
  department_type: z.string().trim().min(1).max(60),
});

function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role>("tourist");
  const [digitalId, setDigitalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    emergency_contact: "",
    department_type: "Tourist Police",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const schema = role === "tourist" ? touristSchema : deptSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const newId = generateDigitalId(role);

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: form.full_name,
          phone: form.phone,
          role,
          emergency_contact: role === "tourist" ? form.emergency_contact : null,
          department_type: role === "department" ? form.department_type : null,
          digital_id: newId,
        },
      },
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setDigitalId(newId);
    setStep(3);
    toast.success("Digital ID created!");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <Link to="/">
            <Logo />
          </Link>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-12 rounded-full transition-colors ${
                step >= s ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Choose Your Role</CardTitle>
              <CardDescription>How will you be using SafeGo?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(["tourist", "department"] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex w-full items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors ${
                    role === r
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {r === "tourist" ? <User className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="font-semibold capitalize">{r}</div>
                    <div className="text-sm text-muted-foreground">
                      {r === "tourist"
                        ? "I'm traveling and want to stay safe"
                        : "I'm a safety/police authority"}
                    </div>
                  </div>
                </button>
              ))}
              <Button onClick={() => setStep(2)} className="w-full">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Have an account?{" "}
                <Link to="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Details</CardTitle>
              <CardDescription>
                Signing up as a <span className="capitalize">{role}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{role === "department" ? "Department / Officer Name" : "Full Name"}</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>
                {role === "tourist" ? (
                  <div className="space-y-1.5">
                    <Label>Emergency Contact</Label>
                    <Input
                      value={form.emergency_contact}
                      onChange={(e) =>
                        setForm({ ...form, emergency_contact: e.target.value })
                      }
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Department Type</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.department_type}
                      onChange={(e) =>
                        setForm({ ...form, department_type: e.target.value })
                      }
                    >
                      <option>Tourist Police</option>
                      <option>Local Police</option>
                      <option>Ambulance</option>
                      <option>Tourism Authority</option>
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? "Creating..." : "Generate Digital ID"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="h-6 w-6" />
              </div>
              <CardTitle>Welcome to SafeGo!</CardTitle>
              <CardDescription>Your Digital ID has been created.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Your Digital ID
                </p>
                <p className="mt-2 font-mono text-sm font-bold">{digitalId}</p>
              </div>
              <Button
                onClick={() =>
                  navigate({ to: role === "tourist" ? "/tourist" : "/department" })
                }
                className="w-full"
              >
                Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
