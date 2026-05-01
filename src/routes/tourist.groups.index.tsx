import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Users, ArrowRight, LogIn, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/tourist/groups/")({
  component: GroupsPage,
});

interface Group {
  id: string;
  name: string;
  invite_code: string;
  creator_id: string;
}

function GroupsPage() {
  const { user } = useAuth();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    // Get groups I'm a member of
    const { data: memberships } = await supabase
      .from("tour_group_members")
      .select("group_id")
      .eq("user_id", user.id);
    const ids = memberships?.map((m) => m.group_id) ?? [];
    if (ids.length === 0) {
      setMyGroups([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("tour_groups").select("*").in("id", ids);
    setMyGroups(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link to="/tourist">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Group Tours</h1>
          <p className="text-sm text-muted-foreground">
            Create or join a tour group to track each other live and stay safe together.
          </p>
        </div>
        <div className="flex gap-2">
          <JoinGroupDialog onJoined={load} />
          <CreateGroupDialog onCreated={load} />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : myGroups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You haven't joined any tour groups yet. Create one or join with an invite code.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {myGroups.map((g) => (
            <Card key={g.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" /> {g.name}
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  Code: {g.invite_code}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link to="/tourist/groups/$groupId" params={{ groupId: g.id }} search={{ applyTour: undefined }}>
                    Open Group <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGroupDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!user || !name.trim()) {
      toast.error("Group name required");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("tour_groups")
      .insert({ name: name.trim(), creator_id: user.id })
      .select()
      .single();
    if (error || !data) {
      setBusy(false);
      toast.error(error?.message ?? "Failed to create group");
      return;
    }
    // Auto-join creator
    await supabase
      .from("tour_group_members")
      .insert({ group_id: data.id, user_id: user.id });
    setBusy(false);
    setOpen(false);
    setName("");
    toast.success(`Group created. Invite code: ${data.invite_code}`);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" /> New Group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a tour group</DialogTitle>
          <DialogDescription>
            You'll get a shareable invite code your friends can use to join.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Araku Weekend Trip"
            />
          </div>
          <Button onClick={create} disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create Group"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JoinGroupDialog({ onJoined }: { onJoined: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async () => {
    if (!user || !code.trim()) {
      toast.error("Invite code required");
      return;
    }
    setBusy(true);
    const { data: g } = await supabase
      .from("tour_groups")
      .select("id, name")
      .eq("invite_code", code.trim().toUpperCase())
      .maybeSingle();
    if (!g) {
      setBusy(false);
      toast.error("Invalid invite code");
      return;
    }
    const { error } = await supabase
      .from("tour_group_members")
      .insert({ group_id: g.id, user_id: user.id });
    setBusy(false);
    if (error && !error.message.includes("duplicate")) {
      toast.error(error.message);
      return;
    }
    toast.success(`Joined ${g.name}`);
    setOpen(false);
    setCode("");
    onJoined();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <LogIn className="mr-1 h-4 w-4" /> Join
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a group</DialogTitle>
          <DialogDescription>Enter the invite code shared with you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Invite code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. AB12CD34"
              className="font-mono uppercase"
            />
          </div>
          <Button onClick={join} disabled={busy} className="w-full">
            {busy ? "Joining…" : "Join Group"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
