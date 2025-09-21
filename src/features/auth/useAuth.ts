// src/features/auth/useAuth.ts
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export function useSession() {
  const [session, setSession] = useState(() => supabase.auth.getSession().then(r => r.data.session));

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(Promise.resolve(s)));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}
