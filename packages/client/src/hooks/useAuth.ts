import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';

interface User {
  id: string;
  username: string;
  rating: number;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loginWithPassword = useCallback(async (username: string, password: string) => {
    const user = await apiFetch<User>('/auth/login/password', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUser(user);
    return user;
  }, []);

  const registerWithPassword = useCallback(async (username: string, password: string) => {
    const user = await apiFetch<User>('/auth/register/password', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return { user, loading, loginWithPassword, registerWithPassword, logout };
}
