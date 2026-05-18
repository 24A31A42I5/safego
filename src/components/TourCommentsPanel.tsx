import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Comment {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
}

export function TourCommentsPanel({ tourId }: { tourId: string }) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    supabase
      .from("shared_tour_comments")
      .select("id,user_id,user_name,text,created_at")
      .eq("tour_id", tourId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (mounted) {
          setComments(data ?? []);
          setLoading(false);
        }
      });

    const ch = supabase
      .channel(`tour-comments-${tourId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shared_tour_comments", filter: `tour_id=eq.${tourId}` },
        (payload) => {
          const c = payload.new as Comment;
          setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "shared_tour_comments", filter: `tour_id=eq.${tourId}` },
        (payload) => {
          const c = payload.old as { id: string };
          setComments((prev) => prev.filter((x) => x.id !== c.id));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [tourId]);

  const submit = async () => {
    if (!user || !profile || !text.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("shared_tour_comments").insert({
        tour_id: tourId,
        user_id: user.id,
        user_name: profile.full_name,
        text: text.trim().slice(0, 1000),
      });
      if (error) throw error;
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("shared_tour_comments").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="space-y-3">
      {user && (
        <div className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            placeholder="Share a tip or ask a question…"
            rows={2}
            className="flex-1"
          />
          <Button size="icon" onClick={submit} disabled={busy || !text.trim()} aria-label="Post comment">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">No comments yet — start the conversation.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[10px]">
                  {c.user_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold">{c.user_name}</span>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                  {user?.id === c.user_id && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
