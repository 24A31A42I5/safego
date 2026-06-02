import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Users, MapPin, Clock, Loader2, CheckCircle2, Hourglass } from "lucide-react";

export const Route = createFileRoute("/tourist/groups/join/$groupId")({
  head: () => ({
    meta: [
      { title: "Join Group Tour — SafeGo" },
      { name: "description", content: "Preview a SafeGo tour group and request to join." },
    ],
  }),
  component: JoinGroupPage,
});

interface GroupPreview {
  id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  images: string[];
  group_code: string;
  creator_id: string;
  tags: string[];
  route_distance_m: number;
  route_duration_s: number;
  waypoints: unknown;
}

function JoinGroupPage() {
  const { groupId } = Route.useParams();
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupPreview | null>(null);
  const [creatorName, setCreatorName] = useState<string>("");
  const [memberCount, setMemberCount] = useState<number>(0);
  const [isMember, setIsMember] = useState(false);
  const [requestStatus, setRequestStatus] = useState<"none" | "pending" | "rejected">("none");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login", search: { redirect: `/tourist/groups/join/${groupId}` } as never });
      return;
    }
    (async () => {
      setLoading(true);
      const { data: g } = await supabase
        .from("tour_groups")
        .select("id,name,description,cover_image,images,group_code,creator_id,tags,route_distance_m,route_duration_s,waypoints")
        .eq("id", groupId)
        .maybeSingle();
      if (!g) {
        toast.error("Group not found");
        navigate({ to: "/tourist/groups" });
        return;
      }
      setGroup(g);

      const [{ data: members }, { data: creator }] = await Promise.all([
        supabase.from("tour_group_members").select("user_id").eq("group_id", g.id),
        supabase.from("profiles").select("full_name").eq("id", g.creator_id).maybeSingle(),
      ]);
      setMemberCount(members?.length ?? 0);
      setCreatorName(creator?.full_name ?? "Group admin");
      setIsMember(!!members?.some((m) => m.user_id === user.id));

      const { data: req } = await supabase
        .from("group_join_requests")
        .select("status")
        .eq("group_id", g.id)
        .eq("requester_id", user.id)
        .in("status", ["pending", "rejected"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (req) setRequestStatus(req.status as "pending" | "rejected");

      setLoading(false);
    })();
  }, [groupId, user, authLoading, navigate]);

  const requestJoin = async () => {
    if (!user || !group || !profile) return;
    setBusy(true);
    const { error } = await supabase.from("group_join_requests").insert({
      group_id: group.id,
      requester_id: user.id,
      requester_name: profile.full_name,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRequestStatus("pending");
    toast.success("Request sent. The admin will review it.");
  };

  if (loading || !group) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const stopCount = Array.isArray(group.waypoints) ? group.waypoints.length : 0;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/tourist/groups">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>

      <Card className="overflow-hidden">
        {group.cover_image ? (
          <div className="relative h-48 w-full bg-muted">
            <img src={group.cover_image} alt={group.name} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 text-white">
              <h1 className="text-2xl font-bold drop-shadow">{group.name}</h1>
              <p className="text-xs opacity-90">Hosted by {creatorName}</p>
            </div>
          </div>
        ) : (
          <CardHeader>
            <CardTitle>{group.name}</CardTitle>
            <p className="text-xs text-muted-foreground">Hosted by {creatorName}</p>
          </CardHeader>
        )}
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {memberCount} member{memberCount === 1 ? "" : "s"}</span>
            {stopCount > 0 && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {stopCount} stop{stopCount === 1 ? "" : "s"}</span>
            )}
            {group.route_duration_s > 0 && (
              <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {Math.round(group.route_duration_s / 60)} min</span>
            )}
          </div>

          {group.description && (
            <p className="text-sm leading-relaxed">{group.description}</p>
          )}

          {group.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {group.tags.map((t) => (
                <Badge key={t} variant="secondary" className="capitalize">{t}</Badge>
              ))}
            </div>
          )}

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <span className="text-muted-foreground">Group code:</span>{" "}
            <span className="font-mono font-semibold">{group.group_code}</span>
          </div>

          {/* Action area */}
          {isMember ? (
            <Button asChild className="w-full" size="lg">
              <Link to="/tourist/groups/$groupId" params={{ groupId: group.id }} search={{ applyTour: undefined }}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Open group
              </Link>
            </Button>
          ) : requestStatus === "pending" ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Hourglass className="h-4 w-4" /> Waiting for admin approval
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                You'll be added once {creatorName} approves your request.
              </p>
            </div>
          ) : requestStatus === "rejected" ? (
            <div className="space-y-2">
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                Your previous request was declined.
              </div>
              <Button onClick={requestJoin} disabled={busy} className="w-full" size="lg">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Request again
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="ghost" size="lg">
                <Link to="/tourist/groups">Cancel</Link>
              </Button>
              <Button onClick={requestJoin} disabled={busy} size="lg">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Request to join
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
