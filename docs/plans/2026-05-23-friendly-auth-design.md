# Friendlier Login & Registration — Design

**Date:** 2026-05-23
**Status:** Approved, ready for implementation plan

## Problem

The current auth screen (`packages/client/src/pages/Login.tsx`) presents four buttons at once — Sign In, Create Account, Sign in with Passkey, Create Account with Passkey — on a single screen that serves both brand-new and returning players. Two independent decisions (new vs. returning, password vs. passkey) collide in one place, so nothing is obviously "the thing to do." The validation rules (username 3–20 alphanumeric/underscore, password 8+ characters) are invisible until the server rejects a submission, and errors appear as one generic line at the bottom.

## Goal

Reduce the choices a person faces at first glance to one obvious action per path, and add targeted friendliness so the form feels welcoming rather than merely functional.

## Scope

A focused refactor of the client login UI. **No server changes** — all four existing auth endpoints and their validation stay exactly as they are. The `useAuth` hook keeps the same public surface.

Files touched:
- `packages/client/src/pages/Login.tsx` — rewritten as a tabbed form
- `packages/client/src/pages/Login.module.css` — tab + hint + field-error styles
- `packages/client/src/api.ts` — throw an `ApiError` carrying HTTP `status`
- `packages/client/src/pages/Login.test.tsx` — extended coverage

## Design decisions (validated during brainstorming)

1. **Structure: two tabs.** `Sign In` (default) and `Create Account`. Chosen over a smart "Continue" field (needs a username-existence lookup round-trip) and a welcome-chooser landing (extra click). Tabs are the most familiar pattern and keep everything on one screen.
2. **Method emphasis: password leads.** Each tab shows the username/password form as the default with one primary button, and a single secondary `🔑 Use a passkey` / `🔑 Create with a passkey` button below an "or" divider. A password works for everyone with an account, so it never strands someone whose current device has no passkey; the passkey stays one tap away.
3. **Four friendly touches**, all in scope: rules shown upfront, show/hide password, clearer field-level errors, loading & focus polish.

## Components & behavior

### Tabs
A two-tab header above the form. State: `mode: 'signin' | 'register'`, default `'signin'`. The active tab is visually marked (underline/accent). The typed **username persists across tab switches**; password and all errors clear on switch.

### Per-tab form (password leads)
- Username field + password field + one primary button labelled `Sign In` or `Create Account`.
- An "or" divider, then one secondary button: `🔑 Use a passkey` (signin) / `🔑 Create with a passkey` (register), enabled only once a username is present (matching today's passkey behavior, which needs only a username).

### Rules upfront (Create Account tab only)
- Hint under username: "3–20 letters, numbers, or underscores".
- Hint under password: "At least 8 characters".
- Not shown on the Sign In tab — returning users don't need to be re-taught the rules.

### Show/hide password
- A reveal toggle inside the password field that switches the input between `password` and `text`.
- Resets to hidden on submit and on tab switch.

### Field-level errors
- Error state shape: `{ username?: string; password?: string; form?: string }`.
- **Client-side validation runs first**, before any network request:
  - Username: non-empty, length 3–20, matches `/^[a-zA-Z0-9_]+$/`.
  - Password (password flows only): length ≥ 8.
  - Failures render inline beneath the relevant field; submission is blocked.
- **Server errors map by HTTP status** (no brittle string matching):
  - `409` → username field: "That username is taken — try another".
  - `401` → form-level: "Incorrect username or password".
  - Any other failure → friendly form-level fallback (uses the server message if present, else a generic line).
- The username regex and length bounds are defined as small constants in the client so the hint text and the validation can't drift apart. (They mirror the server rules, which remain the source of truth.)

### Loading & focus
- While a request is in flight: the primary button shows "Signing in…" / "Creating account…", and buttons disable. The existing `inFlight` ref double-submit guard is preserved.
- The username field auto-focuses on mount and when switching tabs.

## Data flow

All field/tab/error/loading state lives in `Login.tsx`. On submit: client validation → on pass, call the existing `useAuth` callback (`onLogin` / `onRegister` / `onLoginPasskey` / `onRegisterPasskey`) → on success the hook sets the user as it does today → on failure, the thrown `ApiError` is mapped into field state.

`api.ts` change: define `class ApiError extends Error { status: number }` and throw it (instead of a bare `Error`) when a response is not OK, carrying both the server `error` message and the HTTP status. Existing callers that read `err.message` keep working unchanged.

## Error handling

- Obvious input problems are caught client-side and shown inline before any request leaves the browser.
- Network/server failures surface as a friendly form-level message rather than a raw error.
- Passkey errors — user cancels the browser prompt, or the device has no matching passkey — surface as a form-level message without crashing the page.
- The rate-limit response (429, "Too many requests…") falls through to the form-level fallback and is shown as-is.

## Explicitly out of scope (YAGNI)

- **Password reset / "forgot password"** — the app has no email system; this is a separate subsystem, not part of this work.
- **"Remember me"** — the session cookie already lasts 30 days.
- The smart-"Continue" and welcome-chooser layouts considered and set aside during brainstorming.
- Any change to server-side auth logic, validation, or the `useAuth` public API.

## Testing

Extend `packages/client/src/pages/Login.test.tsx`:
- Tab switching renders the correct form (Sign In vs. Create Account) and preserves the typed username across the switch.
- Create Account tab shows the username and password hint text.
- Client-side validation blocks submit and shows an inline error for: too-short username, invalid username characters, too-short password.
- The show/hide toggle flips the password input's `type` between `password` and `text`.
- A simulated `409` maps to a username-field error; a `401` maps to a form-level error.
- The existing double-submit guard test continues to pass.
