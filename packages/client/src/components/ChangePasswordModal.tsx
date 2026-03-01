import { useState, useRef, useEffect } from 'react';
import styles from './ChangePasswordModal.module.css';

interface ChangePasswordModalProps {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  onClose: () => void;
}

export function ChangePasswordModal({ onSubmit, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => { clearTimeout(timerRef.current); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(currentPassword, newPassword);
      setSuccess(true);
      timerRef.current = setTimeout(onClose, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Change password" onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Change Password</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={styles.input}
            autoFocus
            autoComplete="current-password"
          />
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={styles.input}
            autoComplete="new-password"
          />
          {error && <p className={styles.error}>{error}</p>}
          {success && <p className={styles.success}>Password changed successfully</p>}
          <div className={styles.buttons}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>Cancel</button>
            <button type="submit" disabled={submitting || !currentPassword || !newPassword} className={styles.submitButton}>
              {submitting ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
