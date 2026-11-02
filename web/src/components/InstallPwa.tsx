import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
}

export function InstallPwa() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('pwa-install-dismissed') === '1'
  );
  const [hidden, setHidden] = useState(isStandaloneDisplay);

  useEffect(() => {
    const onInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setHidden(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || dismissed) return null;

  const showIosHint = isIosSafari() && !deferred;

  if (!deferred && !showIosHint) return null;

  function dismiss() {
    sessionStorage.setItem('pwa-install-dismissed', '1');
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return (
    <div className="install-pwa" role="region" aria-label="App installieren">
      <div className="install-pwa-inner">
        <p className="install-pwa-text">
          {showIosHint
            ? 'Als App nutzen: Teilen → „Zum Home-Bildschirm“.'
            : 'Alamida Monitoring als App auf Desktop oder Handy installieren.'}
        </p>
        <div className="install-pwa-actions">
          {!showIosHint && (
            <button type="button" className="btn-primary install-pwa-btn" onClick={install}>
              Installieren
            </button>
          )}
          <button type="button" className="btn-ghost install-pwa-btn" onClick={dismiss}>
            Später
          </button>
        </div>
      </div>
    </div>
  );
}
