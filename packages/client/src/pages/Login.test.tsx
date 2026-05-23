import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Login } from './Login.js';

function noopProps() {
  return {
    onLogin: vi.fn(() => new Promise<any>(() => {})), // never resolves -> stays in-flight
    onRegister: vi.fn(() => new Promise<any>(() => {})),
    onLoginPasskey: vi.fn(() => new Promise<any>(() => {})),
    onRegisterPasskey: vi.fn(() => new Promise<any>(() => {})),
  };
}

describe('Login double-submit guard', () => {
  it('calls onLogin only once when the form is submitted twice while in flight', async () => {
    const props = noopProps();
    const { container } = render(<Login {...props} />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(props.onLogin).toHaveBeenCalledTimes(1);
  });
});
