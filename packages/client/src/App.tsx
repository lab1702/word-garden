import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from './hooks/useAuth.js';
import { Login } from './pages/Login.js';
import { Lobby } from './pages/Lobby.js';

export function App() {
  const { user, loading, loginWithPassword, registerWithPassword, logout } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) {
    return <Login onLogin={loginWithPassword} onRegister={registerWithPassword} />;
  }

  return (
    <BrowserRouter>
      <div>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '2px solid #e0d8cc' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontWeight: 'bold', color: '#2C1810' }}>
            {user.username} ({Math.round(user.rating)})
          </span>
          <button onClick={logout} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}>
            Sign Out
          </button>
        </header>
        <Routes>
          <Route path="/" element={<Lobby username={user.username} rating={user.rating} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
