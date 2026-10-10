import { useState } from "react";
import type { SessionState } from "../lib/use-session.js";

export function SignIn({ session, onDone }: { session: SessionState; onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await session.sendMagicLink(email);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await session.verifyCode(email, code);
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="signin">
      <header className="section-head">
        <h2>Sign in</h2>
        <p>
          An account syncs your workspace across devices and lets you bring your own model API key. No password: we email you a link.
          Without an account everything stays in this browser.
        </p>
      </header>
      {!sent ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label>
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <button className="primary" type="submit" disabled={busy || !email.includes("@")}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      ) : (
        <div>
          <p className="callout">
            Check <strong>{email}</strong> for a sign-in link. Open it on this device to continue.
          </p>
          <details>
            <summary>Have a code instead?</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <label>
                6-digit code
                <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </label>
              <button className="secondary" type="submit" disabled={busy || code.trim().length < 6}>
                Verify code
              </button>
            </form>
          </details>
          <button className="secondary" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      )}
      {error && <p className="banner error">{error}</p>}
    </section>
  );
}
