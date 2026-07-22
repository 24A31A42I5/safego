import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "tourist" | "department";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  emergency_contact: string | null;
  department_type: string | null;
  digital_id: string;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(prof as Profile | null);
    setRole((roles?.[0]?.role as AppRole) ?? null);
  };

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Ignore noisy events (TOKEN_REFRESHED fires ~hourly + on tab focus,
      // INITIAL_SESSION on every mount). Only react to identity transitions.
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      )
        return;
      if (cancelled) return;
      setSession(s);
      if (s?.user) {
        // Defer to avoid deadlock inside the Supabase auth callback.
        setTimeout(() => {
          if (!cancelled) loadProfile(s.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => {
          if (!cancelled) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Clear local state first so protected UI unmounts before the 401 storm
    // that would otherwise follow signOut() as queries retry against a
    // cleared session.
    setProfile(null);
    setRole(null);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Best-effort: even if network fails, local session is cleared above.
    }
  };

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role,
        loading,
        signOut,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
