import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [installed, setInstalled] = useState(null);
  const [loading, setLoading] = useState(true);
  const [smtpEnabled, setSmtpEnabled] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/install/status').then((r) => r.json()).catch(() => ({ installed: true })),
      fetch('/api/auth/smtp-enabled').then((r) => r.json()).catch(() => ({ enabled: false })),
    ])
      .then(([authData, installData, smtpData]) => {
        setUser(authData?.user ?? null);
        setInstalled(installData?.installed ?? true);
        setSmtpEnabled(smtpData?.enabled ?? false);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Login failed');
    setUser(data.user);
    return data.user;
  }

  async function register(username, password, confirmPassword, email = '') {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, confirmPassword, email }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Registration failed');
    setUser(data.user);
    return data.user;
  }

  async function refreshUser() {
    const r = await fetch('/api/auth/me');
    if (r.ok) {
      const data = await r.json();
      setUser(data.user ?? null);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  function completeInstall(userData) {
    setInstalled(true);
    setUser(userData);
  }

  return (
    <AuthContext.Provider value={{ user, loading, installed, smtpEnabled, login, register, logout, refreshUser, completeInstall }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
