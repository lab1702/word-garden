import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from './hooks/useAuth.js';
import { Login } from './pages/Login.js';

export function App() {
  const { user, loading, loginWithPassword, registerWithPassword, logout } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) {
    return <Login onLogin={loginWithPassword} onRegister={registerWithPassword} />;
  }

  return (
    <BrowserRouter>
      <div>
        <header>
          <span>{user.username} ({Math.round(user.rating)})</span>
          <button onClick={logout}>Sign Out</button>
        </header>
        <Routes>
          <Route path="/" element={<div>Lobby coming next...</div>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
