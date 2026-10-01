'use client';

import { useEffect } from 'react';

/** Registers /sw.js so the app can be installed and receive shares (production only). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {}); // not installable, nothing else changes
    }
  }, []);
  return null;
}
