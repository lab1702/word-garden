import { useState, useEffect, useCallback } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
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

  const registerWithPasskey = useCallback(async (username: string) => {
    const options = await apiFetch<any>('/auth/register/passkey/options', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    const { challengeId, ...optionsJSON } = options;
    const credential = await startRegistration({ optionsJSON });
    const user = await apiFetch<User>('/auth/register/passkey/verify', {
      method: 'POST',
      body: JSON.stringify({ username, credential, challengeId }),
    });
    setUser(user);
    return user;
  }, []);

  const loginWithPasskey = useCallback(async (username: string) => {
    const options = await apiFetch<any>('/auth/login/passkey/options', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    const { challengeId, ...optionsJSON } = options;
    const credential = await startAuthentication({ optionsJSON });
    const user = await apiFetch<User>('/auth/login/passkey/verify', {
      method: 'POST',
      body: JSON.stringify({ username, credential, challengeId }),
    });
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return { user, loading, loginWithPassword, registerWithPassword, registerWithPasskey, loginWithPasskey, logout };
}
