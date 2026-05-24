import { useState, useRef, useEffect, type FormEvent } from 'react';
import styles from './Login.module.css';

type Mode = 'signin' | 'register';

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<any>;
  onRegister: (username: string, password: string) => Promise<any>;
  onLoginPasskey: (username: string) => Promise<any>;
  onRegisterPasskey: (username: string) => Promise<any>;
}

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 8;

const USERNAME_HINT = '3–20 letters, numbers, or underscores';
const PASSWORD_HINT = 'At least 8 characters';
const USERNAME_ERROR = 'Username must be 3–20 letters, numbers, or underscores';
const PASSWORD_ERROR = 'Password must be at least 8 characters';

interface FieldErrors {
  username?: string;
  password?: string;
  form?: string;
}

function validateUsername(username: string): string | undefined {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX || !USERNAME_RE.test(username)) {
    return USERNAME_ERROR;
  }
  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (password.length < PASSWORD_MIN) {
    return PASSWORD_ERROR;
  }
  return undefined;
}

function mapError(err: any): FieldErrors {
  const status = err?.status;
  if (status === 409) return { username: 'That username is taken — try another' };
  if (status === 401) return { form: 'Incorrect username or password' };
  return { form: err?.message || 'Something went wrong' };
}

export function Login({ onLogin, onRegister, onLoginPasskey, onRegisterPasskey }: LoginProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  const isRegister = mode === 'register';

  // Auto-focus the username field on mount and whenever the tab changes.
  useEffect(() => {
    usernameRef.current?.focus();
  }, [mode]);

  function switchMode(next: Mode) {
    if (inFlight.current || next === mode) return;
    setMode(next);
    setPassword('');
    setShowPassword(false);
    setErrors({});
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;

    const nextErrors: FieldErrors = {};
    const uErr = validateUsername(username);
    if (uErr) nextErrors.username = uErr;
    const pErr = validatePassword(password);
    if (pErr) nextErrors.password = pErr;
    if (nextErrors.username || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }

    inFlight.current = true;
    setErrors({});
    setLoading(true);
    try {
      if (isRegister) {
        await onRegister(username, password);
      } else {
        await onLogin(username, password);
      }
    } catch (err: any) {
      setErrors(mapError(err));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  async function handlePasskey() {
    if (inFlight.current) return;

    const uErr = validateUsername(username);
    if (uErr) {
      setErrors({ username: uErr });
      return;
    }

    inFlight.current = true;
    setErrors({});
    setLoading(true);
    try {
      if (isRegister) {
        await onRegisterPasskey(username);
      } else {
        await onLoginPasskey(username);
      }
    } catch (err: any) {
      setErrors(mapError(err));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  const primaryLabel = loading
    ? (isRegister ? 'Creating account…' : 'Signing in…')
    : (isRegister ? 'Create Account' : 'Sign In');
  const passkeyLabel = isRegister ? 'Create with a passkey' : 'Use a passkey';

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Word Garden</h1>
        <p className={styles.subtitle}>Grow your vocabulary</p>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={mode === 'signin' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => switchMode('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => switchMode('register')}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handlePasswordSubmit} className={styles.form}>
          <div className={styles.field}>
            <input
              ref={usernameRef}
              name="username"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={styles.input}
              autoComplete="username"
              aria-invalid={!!errors.username}
              required
            />
            {isRegister && !errors.username && <p className={styles.hint}>{USERNAME_HINT}</p>}
            {errors.username && <p className={styles.fieldError}>{errors.username}</p>}
          </div>

          <div className={styles.field}>
            <div className={styles.passwordWrap}>
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                aria-invalid={!!errors.password}
                required
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {isRegister && !errors.password && <p className={styles.hint}>{PASSWORD_HINT}</p>}
            {errors.password && <p className={styles.fieldError}>{errors.password}</p>}
          </div>

          {errors.form && <p className={styles.error}>{errors.form}</p>}

          <button type="submit" className={styles.primaryButton} disabled={loading}>
            {primaryLabel}
          </button>

          <div className={styles.divider}><span>or</span></div>

          <button
            type="button"
            className={styles.secondaryButton}
            disabled={loading || !username}
            onClick={handlePasskey}
          >
            🔑 {passkeyLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
