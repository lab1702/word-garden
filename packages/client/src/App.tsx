import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from './hooks/useAuth.js';
import { Login } from './pages/Login.js';
import { Lobby } from './pages/Lobby.js';
import { Game } from './pages/Game.js';

export function App() {
  const { user, loading, loginWithPassword, registerWithPassword, loginWithPasskey, registerWithPasskey, logout } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) {
    return <Login onLogin={loginWithPassword} onRegister={registerWithPassword} onLoginPasskey={loginWithPasskey} onRegisterPasskey={registerWithPasskey} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || '/'}>
      <div>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '2px solid var(--color-border)' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontWeight: 'bold', color: 'var(--color-text)' }}>
            {user.username} ({Math.round(user.rating)})
          </span>
          <button onClick={logout} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--color-text)' }}>
            Sign Out
          </button>
        </header>
        <Routes>
          <Route path="/" element={<Lobby username={user.username} rating={user.rating} />} />
          <Route path="/game/:id" element={<Game />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
