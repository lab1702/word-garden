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

  it('does not switch tabs while a request is in flight', () => {
    const props = pendingProps(); // onLogin never resolves
    const { container } = render(<Login {...props} />);
    fillCredentials();
    fireEvent.submit(container.querySelector('form')!);
    // A sign-in is now pending; clicking the Create Account tab must be ignored.
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    // Still on Sign In: the primary submit button keeps its in-flight label.
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Account' })).not.toBeInTheDocument();
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

  it('hides the password again after a failed submit', async () => {
    const props = resolvedProps();
    props.onLogin = vi.fn(() =>
      Promise.reject(Object.assign(new Error('Invalid credentials'), { status: 401 })));
    const { container } = render(<Login {...props} />);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'text');
    fireEvent.submit(container.querySelector('form')!);
    await screen.findByText('Incorrect username or password');
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password');
  });
});

describe('Server error mapping', () => {
  it('maps a 409 to a username-field error when registering', async () => {
    const props = resolvedProps();
    props.onRegister = vi.fn(() =>
      Promise.reject(Object.assign(new Error('Username already taken'), { status: 409 })));
    const { container } = render(<Login {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
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

  it('shows a friendly message when a passkey sign-in fails without an HTTP status', async () => {
    const props = resolvedProps();
    // A dismissed/timed-out WebAuthn prompt rejects with a bare Error (no status).
    props.onLoginPasskey = vi.fn(() =>
      Promise.reject(new Error('The operation either timed out or was not allowed')));
    render(<Login {...props} />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: /Use a passkey/ }));
    expect(await screen.findByText(/Could not sign in with a passkey/)).toBeInTheDocument();
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

  it('shows the in-flight label on the passkey button, not the primary, during a passkey sign-in', () => {
    render(<Login {...pendingProps()} />); // onLoginPasskey never resolves
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: /Use a passkey/ }));
    // The passkey button reports progress...
    expect(screen.getByRole('button', { name: /Signing in/ })).toBeInTheDocument();
    // ...while the primary submit button keeps its idle label.
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('shows a creating-account label while registering', () => {
    const { container } = render(<Login {...pendingProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    fillCredentials();
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('button', { name: 'Creating account…' })).toBeInTheDocument();
  });
});
