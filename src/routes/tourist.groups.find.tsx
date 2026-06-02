import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/tourist/groups/find")({
  head: () => ({
    meta: [
      { title: "Find a Group — SafeGo" },
      { name: "description", content: "Find a SafeGo tour group by its unique code and request to join." },
    ],
  }),
  component: FindGroupPage,
});

function FindGroupPage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const lookup = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      toast.error("Enter a group code");
      return;
    }
    setBusy(true);
    // Accept either the SG-XXXXX code or the legacy 8-char invite_code
    const { data, error } = await supabase
      .from("tour_groups")
      .select("id, name, group_code, invite_code")
      .or(`group_code.eq.${normalized},invite_code.eq.${normalized}`)
      .maybeSingle();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.error("No group found with that code");
      return;
    }
    navigate({ to: "/tourist/groups/join/$groupId", params: { groupId: data.id } });
  };

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/tourist/groups">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" /> Join a group by code
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ask the group admin for the unique group code (e.g. <span className="font-mono">SG-AB12C</span>) and enter it below.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Group code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="SG-AB12C"
              className="h-12 font-mono uppercase tracking-wider"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") lookup();
              }}
            />
          </div>
          <Button onClick={lookup} disabled={busy} className="w-full" size="lg">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Find group
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
