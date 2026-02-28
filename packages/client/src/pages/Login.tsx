import { useState } from 'react';
import styles from './Login.module.css';

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<any>;
  onRegister: (username: string, password: string) => Promise<any>;
}

export function Login({ onLogin, onRegister }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (action: 'login' | 'register') => {
    setError('');
    setLoading(true);
    try {
      if (action === 'login') {
        await onLogin(username, password);
      } else {
        await onRegister(username, password);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Word Garden</h1>
        <p className={styles.subtitle}>Grow your vocabulary</p>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit('login'); }} className={styles.form}>
          <input
            name="username"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={styles.input}
            autoComplete="username"
            minLength={3}
            maxLength={20}
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
            autoComplete="current-password"
            minLength={8}
            required
          />

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.buttons}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={loading}
            >
              Sign In
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={loading}
              onClick={() => handleSubmit('register')}
            >
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
