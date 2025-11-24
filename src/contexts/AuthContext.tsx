import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Set up auth state listener FIRST
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          setAuthError(null);
        }
      );

      // THEN check for existing session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        setAuthError(null);
      }).catch((error) => {
        console.error('BACKEND_NETWORK_ERROR', error);
        setAuthError("We're having trouble reaching the backend right now. Please try again in a few minutes.");
        setLoading(false);
      });

      return () => subscription.unsubscribe();
    } catch (error) {
      console.error('BACKEND_NETWORK_ERROR', error);
      setAuthError("We're having trouble reaching the backend right now. Please try again in a few minutes.");
      setLoading(false);
    }
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          },
        },
      });
      
      if (error) {
        return { error };
      }
      
      setAuthError(null);
      return { error: null };
    } catch (error: any) {
      console.error('BACKEND_NETWORK_ERROR', error);
      setAuthError("We're having trouble reaching the backend right now. Please try again in a few minutes.");
      return { error: { message: "Network error. Please check your connection." } };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        return { error };
      }
      
      setAuthError(null);
      return { error: null };
    } catch (error: any) {
      console.error('BACKEND_NETWORK_ERROR', error);
      setAuthError("We're having trouble reaching the backend right now. Please try again in a few minutes.");
      return { error: { message: "Network error. Please check your connection." } };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setAuthError(null);
    } catch (error: any) {
      console.error('BACKEND_NETWORK_ERROR', error);
      setAuthError("We're having trouble reaching the backend right now. Please try again in a few minutes.");
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, authError, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
