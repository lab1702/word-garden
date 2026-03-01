import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router';
import { useAuth } from './hooks/useAuth.js';
import { Login } from './pages/Login.js';
import { Lobby } from './pages/Lobby.js';
import { Game } from './pages/Game.js';
import { ChangePasswordModal } from './components/ChangePasswordModal.js';
import styles from './App.module.css';

export function App() {
  const { user, loading, loginWithPassword, registerWithPassword, loginWithPasskey, registerWithPasskey, logout, changePassword, deleteAccount, refreshUser } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) {
    return <Login onLogin={loginWithPassword} onRegister={registerWithPassword} onLoginPasskey={loginWithPasskey} onRegisterPasskey={registerWithPasskey} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || '/'}>
      <div className={styles.layout}>
        <header className={styles.header}>
          <div className={styles.headerBrand}>
            <Link to="/" className={styles.headerTitle}>Word Garden</Link>
            <span className={styles.headerUser}>
              {user.username} ({Math.round(user.rating)})
            </span>
          </div>
          <div className={styles.headerActions}>
            <button onClick={() => { if (confirm('Delete your account? This will permanently remove all your data and game history.')) deleteAccount(); }} className={styles.headerButtonDanger}>
              Delete Account
            </button>
            <button onClick={() => setShowPasswordModal(true)} className={styles.headerButton}>
              Change Password
            </button>
            <button onClick={logout} className={styles.headerButton}>
              Sign Out
            </button>
          </div>
        </header>
        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<Lobby userId={user.id} username={user.username} rating={user.rating} onGameFinished={refreshUser} />} />
            <Route path="/game/:id" element={<Game onGameFinished={refreshUser} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
      {showPasswordModal && (
        <ChangePasswordModal
          onSubmit={changePassword}
          onClose={() => setShowPasswordModal(false)}
        />
      )}
    </BrowserRouter>
  );
}
