import { startSignIn } from '../../lib/auth/session';

export default function SignIn() {
  return (
    <button
      type="button"
      onClick={() => void startSignIn()}
      className="rounded-full bg-honey-bronze px-6 py-3 font-semibold text-dark-slate hover:bg-vanilla-custard focus-visible:outline-2 focus-visible:outline-muted-teal"
    >
      Sign in with Spotify
    </button>
  );
}
