import { useState } from 'react';
import { forgetAccount, getLastAccount } from '../../lib/store/account';

/** The privacy page's "Forget me on this browser". */
export default function ForgetButton() {
  const [done, setDone] = useState(false);

  function forget() {
    forgetAccount(getLastAccount());
    setDone(true);
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={forget}
        className="rounded-full border border-honey-bronze px-4 py-2 text-honey-bronze hover:bg-night-bordeaux/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vanilla-custard"
      >
        Forget me on this browser
      </button>
      {done && <p role="status">Vynl has forgotten you on this browser.</p>}
    </div>
  );
}
