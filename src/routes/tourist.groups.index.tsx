import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Users, ArrowRight, Search, ArrowLeft, Compass } from "lucide-react";

export const Route = createFileRoute("/tourist/groups/")({
  head: () => ({
    meta: [
      { title: "Group Tours — SafeGo" },
      { name: "description", content: "Create or join group tours and plan multi-stop routes with friends in SafeGo." },
      { property: "og:title", content: "Group Tours — SafeGo" },
      { property: "og:description", content: "Create or join group tours and plan multi-stop routes with friends in SafeGo." },
      { property: "og:url", content: "/tourist/groups" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/tourist/groups" }],
  }),
  component: GroupsPage,
});

interface Group {
  id: string;
  name: string;
  invite_code: string;
  group_code: string;
  creator_id: string;
  cover_image: string | null;
}

function GroupsPage() {
  const { user } = useAuth();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
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
    const { data } = await supabase
      .from("tour_groups")
      .select("id, name, invite_code, group_code, creator_id, cover_image")
      .in("id", ids);
    setMyGroups(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/tourist">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Group Tours</h1>
          <p className="text-sm text-muted-foreground">
            Create or join a tour group to track each other live and stay safe together.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="lg" className="flex-1 sm:flex-none">
            <Link to="/tourist/groups/find">
              <Search className="mr-1.5 h-4 w-4" /> Join by code
            </Link>
          </Button>
          <CreateGroupDialog onCreated={load} />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : myGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Compass className="h-7 w-7" />
            </div>
            <div>
              <p className="font-medium">No tour groups yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first group or join one with a code from a friend.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline">
                <Link to="/tourist/groups/find">
                  <Search className="mr-1.5 h-4 w-4" /> Join by code
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {myGroups.map((g) => (
            <Card key={g.id} className="overflow-hidden transition-shadow hover:shadow-md">
              {g.cover_image && (
                <div className="relative h-28 w-full overflow-hidden bg-muted">
                  <img src={g.cover_image} alt={g.name} className="h-full w-full object-cover" />
                </div>
              )}
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate">{g.name}</span>
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  {g.group_code}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
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
    await supabase
      .from("tour_group_members")
      .insert({ group_id: data.id, user_id: user.id });
    setBusy(false);
    setOpen(false);
    setName("");
    toast.success(`Group created — share code ${data.group_code}`);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="flex-1 sm:flex-none">
          <Plus className="mr-1.5 h-4 w-4" /> New Group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a tour group</DialogTitle>
          <DialogDescription>
            You'll get a shareable invite link and a unique group code for friends to join.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Araku Weekend Trip"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
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
