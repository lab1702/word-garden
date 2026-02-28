import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from './hooks/useAuth.js';
import { Login } from './pages/Login.js';
import { Lobby } from './pages/Lobby.js';
import { Game } from './pages/Game.js';

export function App() {
  const { user, loading, loginWithPassword, registerWithPassword, loginWithPasskey, registerWithPasskey, logout, deleteAccount, refreshUser } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) {
    return <Login onLogin={loginWithPassword} onRegister={registerWithPassword} onLoginPasskey={loginWithPasskey} onRegisterPasskey={registerWithPasskey} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || '/'}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '2px solid var(--color-border)' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontWeight: 'bold', color: 'var(--color-text)' }}>
            {user.username} ({Math.round(user.rating)})
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => { if (confirm('Delete your account? This will permanently remove all your data and game history.')) deleteAccount(); }} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--color-danger)', borderRadius: '6px', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
              Delete Account
            </button>
            <button onClick={logout} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--color-text)' }}>
              Sign Out
            </button>
          </div>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Lobby userId={user.id} username={user.username} rating={user.rating} onGameFinished={refreshUser} />} />
            <Route path="/game/:id" element={<Game onGameFinished={refreshUser} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
