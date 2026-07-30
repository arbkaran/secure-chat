import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAccessToken, getUserId } from '../api/authStorage';
import { connectSocket } from '../api/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);

  // Restore a previous session on cold start (Phase 5: JWT survives an app restart).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      const storedUserId = await getUserId();
      if (cancelled) return;
      setUserId(storedUserId);
      setIsLoggedIn(true);
      connectSocket().catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      isLoggedIn,
      userId,
      login: (id) => {
        if (id != null) setUserId(id);
        setIsLoggedIn(true);
      },
      logout: () => {
        setIsLoggedIn(false);
        setUserId(null);
      },
    }),
    [isLoggedIn, userId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
