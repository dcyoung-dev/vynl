import { useEffect, useState } from 'react';
import App from './App';

/** `DEV` is false in `astro build`; the dynamic import below repeats the check inline so Rollup can drop it. */
function demoEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.PUBLIC_VYNL_DEMO === 'true';
}

/** Mounts the app, after the demo's fake Spotify is installed when the demo command set its flag. */
export default function Root() {
  const [ready, setReady] = useState(() => !demoEnabled());

  useEffect(() => {
    if (ready) return;
    let current = true;
    if (import.meta.env.DEV && import.meta.env.PUBLIC_VYNL_DEMO === 'true') {
      void import('../demo/installDemo').then(({ installDemo }) => {
        installDemo();
        if (current) setReady(true);
      });
    }
    return () => {
      current = false;
    };
  }, [ready]);

  return ready ? <App /> : null;
}
