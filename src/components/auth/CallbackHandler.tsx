import { useEffect, useState } from 'react';
import { completeSignIn } from '../../lib/auth/session';
import { appPath } from '../../lib/url';

export default function CallbackHandler() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    completeSignIn(new URL(window.location.href)).then(
      () => {
        window.history.replaceState(null, '', appPath('callback'));
        window.location.replace(appPath());
      },
      () => setFailed(true),
    );
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      {failed ? (
        <div role="alert" className="flex flex-col items-center gap-4">
          <p className="text-lg">Sign-in didn't complete. Please try again.</p>
          <a href={appPath()} className="rounded-full bg-honey-bronze px-6 py-2 font-semibold text-dark-slate">
            Back to Vynl
          </a>
        </div>
      ) : (
        <p className="text-lg">Signing you in…</p>
      )}
    </main>
  );
}
