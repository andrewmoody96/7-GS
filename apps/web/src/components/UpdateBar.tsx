// "New version available · Reload": shown on every screen once an update is waiting,
// so a tab or Home Screen app left open for days doesn't stay on an old version.

import { useState } from 'react';
import { useUpdateAvailable } from '../app/update';

export function UpdateBar() {
  const reload = useUpdateAvailable();
  const [reloading, setReloading] = useState(false);
  if (!reload) return null;
  return (
    <div className="updatebar" role="status">
      <span>New version available</span>
      <button
        type="button"
        className="updatebar__btn"
        disabled={reloading}
        onClick={() => {
          setReloading(true);
          reload();
        }}
      >
        {reloading ? 'Reloading…' : 'Reload'}
      </button>
    </div>
  );
}
