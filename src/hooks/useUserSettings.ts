'use client';

import { useCallback, useState } from 'react';

import { createDefaultSettings, loadUserSettings, persistUserSettings } from '@/lib/preferences/storage';
import { UserSettings } from '@/types/preferences';

export const useUserSettings = () => {
  const [settings, setSettings] = useState<UserSettings>(loadUserSettings);

  const updateSettings = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => {
      const next: UserSettings = { ...prev, [key]: value };
      persistUserSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const defaults = createDefaultSettings();
    setSettings(defaults);
    persistUserSettings(defaults);
  }, []);

  return { settings, updateSettings, resetSettings };
};
