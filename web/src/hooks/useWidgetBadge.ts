import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useSterbefaelle } from './useSterbefaelle';
import { buildWidgetSnapshot } from '../widget/widgetData';
async function setBadgeCount(count: number) {
  if (!('setAppBadge' in navigator)) return;
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) await nav.setAppBadge?.(Math.min(count, 99));
    else await nav.clearAppBadge?.();
  } catch {
    /* Badge API optional */
  }
}

/** App-Icon-Badge: offene Termine heute + extern (Android/Windows PWA). */
export function useWidgetBadge() {
  const { status } = useAuth();
  const { items } = useSterbefaelle();

  useEffect(() => {
    if (status !== 'activated') {
      void setBadgeCount(0);
      return;
    }
    const snap = buildWidgetSnapshot(items);
    void setBadgeCount(snap.badgeCount);
    return () => {
      void setBadgeCount(0);
    };
  }, [status, items]);
}
