'use client';

import { useCallback, useEffect, useState } from 'react';
import { uiLogger } from '@/lib/logger';

const canVibrate = () => typeof window !== 'undefined' && 'vibrate' in navigator;

export const useHaptics = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!canVibrate()) {
      setEnabled(false);
      return;
    }
    const media = window.matchMedia('(pointer: coarse)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setEnabled(media.matches && !motion.matches);
    };
    update();
    media.addEventListener('change', update);
    motion.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
      motion.removeEventListener('change', update);
    };
  }, []);

  const vibrate = useCallback(
    (pattern: number | number[] = 20) => {
      if (!enabled || !canVibrate()) return;
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        uiLogger.warn('Vibration rejected', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [enabled]
  );

  return { vibrate, enabled };
};
