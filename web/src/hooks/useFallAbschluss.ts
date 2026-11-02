import { useCallback, useState } from 'react';
import type { FallAbschlussGrund } from '../board/fallAbschluss';
import { abschliessenSterbefall } from '../services/fallAbschluss';
import type { Sterbefall } from '../types';

export function useFallAbschluss() {
  const [target, setTarget] = useState<Sterbefall | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((fall: Sterbefall) => {
    setError(null);
    setTarget(fall);
  }, []);

  const close = useCallback(() => {
    if (pendingId) return;
    setTarget(null);
    setError(null);
  }, [pendingId]);

  const confirm = useCallback(
    async (grund: FallAbschlussGrund, bemerkung?: string) => {
      if (!target) return;
      setPendingId(target.id);
      setError(null);
      try {
        await abschliessenSterbefall(target.id, grund, bemerkung, target.sterbefallId);
        setTarget(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Abschließen fehlgeschlagen');
      } finally {
        setPendingId(null);
      }
    },
    [target]
  );

  return {
    target,
    pendingId,
    error,
    open,
    close,
    confirm,
    clearError: () => setError(null),
  };
}
