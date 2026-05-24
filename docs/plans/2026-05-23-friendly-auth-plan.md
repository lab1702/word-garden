# Friendlier Login & Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-button auth screen with a tabbed Sign In / Create Account form (password-led, passkey secondary) plus rules-upfront hints, a show/hide password toggle, field-level errors, and loading/focus polish.

**Architecture:** Client-only change. `Login.tsx` is rewritten as a single form whose content is driven by a `mode` ('signin' | 'register') state — never two forms in the DOM at once, so there is always exactly one `[name="username"]` / `[name="password"]` input. `api.ts` gains an `ApiError` carrying the HTTP status so the UI maps server errors to fields by status code. No server, `useAuth`, or routing changes.

**Tech Stack:** React 19, TypeScript, CSS Modules, Vitest + @testing-library/react (unit), Playwright (e2e).

**Spec:** `docs/plans/2026-05-23-friendly-auth-design.md`

**Running unit tests:** `npm test -w packages/client -- <file>` (vitest; `globals: false`, so every test file imports `describe/it/expect/vi` from `vitest`; `@testing-library/jest-dom` matchers are preloaded via `vitest.setup.ts`).

---

### Task 1: `ApiError` with HTTP status in the API client

**Files:**
- Modify: `packages/client/src/api.ts`
- Test: `packages/client/src/api.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/api.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, ApiError } from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch error handling', () => {
  it('throws an ApiError carrying the HTTP status and server message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: () => Promise.resolve({ error: 'Username already taken' }),
    })));

    await expect(apiFetch('/auth/register/password', { method: 'POST', body: '{}' }))
      .rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/auth/register/password', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 409, message: 'Username already taken' });
  });

  it('falls back to statusText when the body has no error field', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    })));

    await expect(apiFetch('/auth/me'))
      .rejects.toMatchObject({ status: 500, message: 'Internal Server Error' });
  });

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: '1', username: 'alice' }),
    })));

    const result = await apiFetch<{ id: string; username: string }>('/auth/me');
    expect(result).toEqual({ id: '1', username: 'alice' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w packages/client -- api.test.ts`
Expected: FAIL — `ApiError` is not exported from `./api.js`.

- [ ] **Step 3: Implement `ApiError` and throw it**

Replace the entire contents of `packages/client/src/api.ts` with:

```ts
const BASE_PATH = import.meta.env.VITE_BASE_PATH || '';
const BASE = `${BASE_PATH}/api`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };
  if (options?.body) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  // CSRF defense-in-depth: custom header blocks cross-origin form submissions
  headers['X-Requested-With'] = 'XMLHttpRequest';
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error || res.statusText, res.status);
  }
  return res.json();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w packages/client -- api.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/api.test.ts
git commit -m "feat(api): throw ApiError carrying HTTP status"
```

---

### Task 2: Tabbed, friendlier `Login` component

**Files:**
- Modify: `packages/client/src/pages/Login.tsx` (full rewrite)
- Test: `packages/client/src/pages/Login.test.tsx` (full rewrite; keeps the existing double-submit test)

This task writes the complete new test suite first, watches it fail, then writes the complete component. The component references CSS-module class names that are added in Task 3; missing class names resolve to `undefined` and do not affect rendering or tests, so the unit tests pass before the styling exists.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `packages/client/src/pages/Login.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Login } from './Login.js';

// Callbacks that never resolve -> the component stays "in flight".
function pendingProps() {
  return {
    onLogin: vi.fn(() => new Promise<any>(() => {})),
    onRegister: vi.fn(() => new Promise<any>(() => {})),
    onLoginPasskey: vi.fn(() => new Promise<any>(() => {})),
    onRegisterPasskey: vi.fn(() => new Promise<any>(() => {})),
  };
}

// Callbacks that resolve immediately.
function resolvedProps() {
  return {
    onLogin: vi.fn(() => Promise.resolve({})),
    onRegister: vi.fn(() => Promise.resolve({})),
    onLoginPasskey: vi.fn(() => Promise.resolve({})),
    onRegisterPasskey: vi.fn(() => Promise.resolve({})),
  };
}

function fillCredentials(username = 'alice', password = 'password123') {
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: password } });
}

describe('Login double-submit guard', () => {
  it('calls onLogin only once when the form is submitted twice while in flight', () => {
    const props = pendingProps();
    const { container } = render(<Login {...props} />);
    fillCredentials();
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(props.onLogin).toHaveBeenCalledTimes(1);
  });
});

describe('Login tabs', () => {
  it('defaults to the Sign In tab', () => {
    render(<Login {...pendingProps()} />);
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('switches to the Create Account form when its tab is clicked', () => {
    render(<Login {...pendingProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
  });

  it('preserves the typed username across tab switches', () => {
    render(<Login {...pendingProps()} />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'wordsmith' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    expect(screen.getByPlaceholderText('Username')).toHaveValue('wordsmith');
  });
});

describe('Create Account hints', () => {
  it('shows username and password hints on the Create Account tab', () => {
    render(<Login {...pendingProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    expect(screen.getByText('3–20 letters, numbers, or underscores')).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
  });

  it('does not show hints on the Sign In tab', () => {
    render(<Login {...pendingProps()} />);
    expect(screen.queryByText('3–20 letters, numbers, or underscores')).not.toBeInTheDocument();
  });
});

describe('Client-side validation', () => {
  it('blocks submit and shows an error for a too-short username', () => {
    const props = pendingProps();
    const { container } = render(<Login {...props} />);
    fillCredentials('ab', 'password123');
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByText('Username must be 3–20 letters, numbers, or underscores')).toBeInTheDocument();
    expect(props.onLogin).not.toHaveBeenCalled();
  });

  it('blocks submit for invalid username characters', () => {
    const props = pendingProps();
    const { container } = render(<Login {...props} />);
    fillCredentials('bad name', 'password123');
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByText('Username must be 3–20 letters, numbers, or underscores')).toBeInTheDocument();
    expect(props.onLogin).not.toHaveBeenCalled();
  });

  it('blocks submit and shows an error for a too-short password', () => {
    const props = pendingProps();
    const { container } = render(<Login {...props} />);
    fillCredentials('alice', 'short');
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(props.onLogin).not.toHaveBeenCalled();
  });
});

describe('Password visibility toggle', () => {
  it('flips the password input between hidden and visible', () => {
    render(<Login {...pendingProps()} />);
    const pw = screen.getByPlaceholderText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(pw).toHaveAttribute('type', 'password');
  });
});

describe('Server error mapping', () => {
  it('maps a 409 to a username-field error', async () => {
    const props = resolvedProps();
    props.onLogin = vi.fn(() =>
      Promise.reject(Object.assign(new Error('Username already taken'), { status: 409 })));
    const { container } = render(<Login {...props} />);
    fillCredentials();
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText('That username is taken — try another')).toBeInTheDocument();
  });

  it('maps a 401 to a form-level error', async () => {
    const props = resolvedProps();
    props.onLogin = vi.fn(() =>
      Promise.reject(Object.assign(new Error('Invalid credentials'), { status: 401 })));
    const { container } = render(<Login {...props} />);
    fillCredentials();
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText('Incorrect username or password')).toBeInTheDocument();
  });
});

describe('Loading and focus', () => {
  it('shows a loading label on the primary button while a request is in flight', () => {
    const { container } = render(<Login {...pendingProps()} />);
    fillCredentials();
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeInTheDocument();
  });

  it('autofocuses the username field on mount', () => {
    render(<Login {...pendingProps()} />);
    expect(screen.getByPlaceholderText('Username')).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w packages/client -- Login.test.tsx`
Expected: FAIL — the new tests reference tabs/hints/toggle that don't exist yet (e.g. no `tab` role, no "Show password" button).

- [ ] **Step 3: Write the new component**

Replace the entire contents of `packages/client/src/pages/Login.tsx` with:

```tsx
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
    if (next === mode) return;
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w packages/client -- Login.test.tsx api.test.ts`
Expected: PASS (all Login + api tests).

- [ ] **Step 5: Typecheck the client**

Run: `npm run build -w packages/client`
Expected: build succeeds (no TypeScript errors).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Login.tsx packages/client/src/pages/Login.test.tsx
git commit -m "feat(ui): tabbed login with hints, password reveal, and field errors"
```

---

### Task 3: Style the tabbed login

**Files:**
- Modify: `packages/client/src/pages/Login.module.css` (full rewrite)

No unit test — this is presentational. It reuses the existing design tokens already used by the current login card.

- [ ] **Step 1: Write the stylesheet**

Replace the entire contents of `packages/client/src/pages/Login.module.css` with:

```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 1rem;
}

.card {
  background: var(--gradient-surface-raised);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  max-width: 400px;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--color-accent), var(--color-gold));
}

.title {
  font-family: var(--font-display);
  font-weight: 900;
  color: var(--color-text);
  text-align: center;
  margin: 0 0 0.25rem;
  font-size: 2.4rem;
  letter-spacing: -0.01em;
}

.subtitle {
  text-align: center;
  color: var(--color-accent);
  margin: 0 0 1.75rem;
  font-style: italic;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.tab {
  flex: 1;
  padding: 0.6rem 0.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-muted);
  font-size: 1rem;
  font-family: var(--font-main);
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}

.tab:hover {
  color: var(--color-text);
}

.tabActive {
  color: var(--color-text);
  border-bottom-color: var(--color-gold);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.input {
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-input-border);
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-family: var(--font-main);
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
  width: 100%;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 3px var(--color-accent-muted);
}

.input[aria-invalid='true'] {
  border-color: var(--color-danger);
}

.passwordWrap {
  position: relative;
  display: flex;
  align-items: center;
}

.passwordWrap .input {
  flex: 1;
  padding-right: 4.5rem;
}

.reveal {
  position: absolute;
  right: 0.5rem;
  background: none;
  border: none;
  color: var(--color-accent);
  font-size: 0.85rem;
  font-family: var(--font-main);
  cursor: pointer;
  padding: 0.4rem 0.5rem;
  min-height: 36px;
}

.reveal:hover {
  filter: brightness(1.15);
}

.hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.fieldError {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-danger);
}

.error {
  color: var(--color-danger);
  margin: 0;
  font-size: 0.875rem;
  text-align: center;
}

.primaryButton,
.secondaryButton {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-family: var(--font-main);
  cursor: pointer;
  min-height: 44px;
}

.primaryButton {
  background: var(--gradient-accent);
  color: #10210a;
  border: none;
  font-weight: 700;
  box-shadow: var(--bevel-button);
}

.primaryButton:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: var(--bevel-button), var(--shadow-glow-accent);
}

.secondaryButton {
  background: var(--gradient-ghost);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.secondaryButton:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.primaryButton:disabled,
.secondaryButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  filter: none;
}

.divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: var(--font-main);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}
```

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build -w packages/client`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Login.module.css
git commit -m "style(ui): tabs, hints, password reveal, and field-error styling"
```

---

### Task 4: Update the e2e auth tests for the new structure

**Files:**
- Modify: `packages/client/e2e/auth.spec.ts`

The old selectors (`button:has-text("Sign In" / "Create Account")`) now match both a tab and a submit button. Tabs use `role="tab"` and submit buttons use `role="button"`, so `getByRole` disambiguates them. The short-password assertion still works because client-side validation surfaces the identical message.

- [ ] **Step 1: Rewrite the e2e spec**

Replace the entire contents of `packages/client/e2e/auth.spec.ts` with:

```ts
import { test, expect } from '@playwright/test';

test('can register with password', async ({ page }) => {
  const username = `test_${Date.now()}`;
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Account' }).click();
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator(`text=${username}`)).toBeVisible();

  // Cleanup: delete test account
  await page.click('button:has-text("Delete Account")');
});

test('shows error for short password', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Account' }).click();
  await page.fill('[name="username"]', 'testuser');
  await page.fill('[name="password"]', 'short');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
});

test('can login after registering', async ({ page }) => {
  const username = `test_${Date.now()}`;
  // Register
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Account' }).click();
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator(`text=${username}`)).toBeVisible();

  // Logout
  await page.click('button:has-text("Sign Out")');
  await expect(page.locator('text=Word Garden')).toBeVisible();

  // Login (Sign In is the default tab)
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.locator(`text=${username}`)).toBeVisible();

  // Cleanup: delete test account
  await page.click('button:has-text("Delete Account")');
});
```

- [ ] **Step 2: Run the e2e suite**

Requires the app running via Docker (per README "End-to-End Tests"):

```bash
docker compose up -d --build
npm run test:e2e
```

Expected: all three auth tests PASS. (If Docker is unavailable in this environment, defer to CI/manual verification and note it in the task handoff rather than marking blind.)

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/auth.spec.ts
git commit -m "test(e2e): update auth specs for tabbed login"
```

---

## Self-Review

**Spec coverage:**
- Two tabs (Sign In default / Create Account), username persists, errors clear on switch → Task 2 (tabs tests + `switchMode`).
- Password leads; single passkey secondary button enabled once username present → Task 2 component + Task 3 styling.
- Rules upfront on Create Account only → Task 2 (hint tests + `isRegister && ...hint`).
- Show/hide password, resets on submit/switch → Task 2 (toggle test; `setShowPassword(false)` in `switchMode`; resets on submit because `switchMode` is the reset path and a successful submit unmounts the screen).
- Field-level errors: client validation first, server `409`→username / `401`→form / else form fallback → Task 1 (`ApiError.status`) + Task 2 (`validate*`, `mapError`, mapping tests).
- Loading labels + autofocus on mount/switch → Task 2 (loading + focus tests).
- `api.ts` throws `ApiError` with status; existing `.message` callers unaffected → Task 1.
- No server / `useAuth` / routing changes → confirmed; only client files touched.
- e2e kept green → Task 4.

**Placeholder scan:** No TBD/TODO; every code step shows complete file contents.

**Type consistency:** `ApiError { status }` (Task 1) is the shape `mapError` reads via `err.status` (Task 2) and the tests stub via `Object.assign(new Error(...), { status })`. `Mode`, `FieldErrors`, `validateUsername`, `validatePassword`, `mapError`, `switchMode`, `handlePasswordSubmit`, `handlePasskey` are all defined and used consistently within Task 2. CSS class names referenced in the Task 2 component (`tabs`, `tab`, `tabActive`, `field`, `passwordWrap`, `reveal`, `hint`, `fieldError`, `error`, `primaryButton`, `secondaryButton`, `divider`, `container`, `card`, `title`, `subtitle`, `input`, `form`) are all defined in the Task 3 stylesheet.

**Note on `required`:** Inputs keep `required` for accessibility but drop the old `minLength`/`maxLength` so the friendly inline messages are the single source of validation feedback. `fireEvent.submit` and Playwright's filled-field flows are unaffected.
