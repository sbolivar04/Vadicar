import { createContext, useState, useEffect, useContext, PropsWithChildren } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Define a custom user type that includes our metadata
export type CustomUser = SupabaseUser & {
  trabajador_id?: string;
  user_metadata: {
    nombre_trabajador?: string;
    rol?: string;
    fecha_contratacion?: string;
  };
};

interface AuthContextType {
  session: Session | null;
  user: CustomUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  logout: async () => { },
  refreshUser: async () => { },
});

export function AuthProvider({ children }: PropsWithChildren<object>) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const trabajador_id = localStorage.getItem('trabajador_id');
      const nombre_trabajador = localStorage.getItem('nombre_trabajador');
      const rol = localStorage.getItem('rol');
      const userData: CustomUser = {
        ...session.user,
        trabajador_id: trabajador_id || undefined,
        user_metadata: {
          ...session.user.user_metadata,
          nombre_trabajador: nombre_trabajador || undefined,
          rol: rol || undefined,
        },
      };
      setUser(userData);
    } else {
      setUser(null);
    }
  };

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        if (session?.user) {
          const trabajador_id = localStorage.getItem('trabajador_id');
          const nombre_trabajador = localStorage.getItem('nombre_trabajador');
          const rol = localStorage.getItem('rol');
          const userData: CustomUser = {
            ...session.user,
            trabajador_id: trabajador_id || undefined,
            user_metadata: {
              ...session.user.user_metadata,
              nombre_trabajador: nombre_trabajador || undefined,
              rol: rol || undefined,
            },
          };
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('AuthProvider: Error in getSession', error);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        const trabajador_id = localStorage.getItem('trabajador_id');
        const nombre_trabajador = localStorage.getItem('nombre_trabajador');
        const rol = localStorage.getItem('rol');
        const userData: CustomUser = {
          ...session.user,
          trabajador_id: trabajador_id || undefined,
          user_metadata: {
            ...session.user.user_metadata,
            nombre_trabajador: nombre_trabajador || undefined,
            rol: rol || undefined,
          },
        };
        setUser(userData);
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    localStorage.removeItem('trabajador_id');
    localStorage.removeItem('nombre_trabajador');
    localStorage.removeItem('rol');
    localStorage.removeItem('fecha_contratacion');
    await supabase.auth.signOut();
  };

  const value = {
    session,
    user,
    loading,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}