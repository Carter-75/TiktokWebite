'use client';

import { useToastContext } from '@/components/providers/ToastProvider';

export const useToast = () => {
  const { pushToast } = useToastContext();
  return { pushToast };
};
