import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** PWA-Installation: Android/Chrome/Edge per Dialog, iOS per Anleitung. */
export function useInstallieren() {
  const [ereignis, setEreignis] = useState<BeforeInstallPromptEvent | null>(null);
  const installiert =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEreignis(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setEreignis(null));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  return {
    moeglich: !installiert && (ereignis !== null || ios),
    ios: ios && !installiert,
    installieren: async () => {
      if (!ereignis) return false;
      await ereignis.prompt();
      const r = await ereignis.userChoice;
      setEreignis(null);
      return r.outcome === 'accepted';
    },
  };
}
