import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Inbox, Loader2 } from "lucide-react";

interface JoinRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  requester_avatar: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

export function GroupJoinRequestsPanel({ groupId, isAdmin }: { groupId: string; isAdmin: boolean }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("group_join_requests")
      .select("*")
      .eq("group_id", groupId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setRequests((data as JoinRequest[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const ch = supabase
      .channel(`requests-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_join_requests", filter: `group_id=eq.${groupId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, isAdmin]);

  if (!isAdmin) return null;

  const decide = async (req: JoinRequest, approve: boolean) => {
    if (!user) return;
    setActingOn(req.id);
    if (approve) {
      // Insert into members first; ignore unique-violation if already member.
      const { error: memErr } = await supabase
        .from("tour_group_members")
        .insert({ group_id: groupId, user_id: req.requester_id });
      if (memErr && !memErr.message.toLowerCase().includes("duplicate")) {
        setActingOn(null);
        toast.error(memErr.message);
        return;
      }
    }
    const { error } = await supabase
      .from("group_join_requests")
      .update({
        status: approve ? "approved" : "rejected",
        decided_at: new Date().toISOString(),
        decided_by: user.id,
      })
      .eq("id", req.id);
    setActingOn(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(approve ? `${req.requester_name} added to the group` : `Rejected ${req.requester_name}`);
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4" />
          Join requests
          {requests.length > 0 && (
            <Badge variant="default" className="ml-1">{requests.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pending requests.</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.requester_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => decide(r, false)}
                  disabled={actingOn === r.id}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => decide(r, true)}
                  disabled={actingOn === r.id}
                >
                  {actingOn === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
