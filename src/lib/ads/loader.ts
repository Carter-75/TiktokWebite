export type AdPlacement = 'footer' | 'inline' | 'sidebar';

const scrubValue = (value?: string | null) => {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const lowered = trimmed.toLowerCase();
  if (trimmed.startsWith('<') || lowered.includes('xxxx')) {
    return '';
  }
  return trimmed;
};

const admobClientId = scrubValue(process.env.NEXT_PUBLIC_ADMOB_CLIENT_ID);
const defaultSlot = scrubValue(process.env.NEXT_PUBLIC_ADMOB_DEFAULT_SLOT);

const slotMap: Record<AdPlacement, string> = {
  footer: scrubValue(process.env.NEXT_PUBLIC_ADMOB_FOOTER_SLOT) || defaultSlot,
  inline: scrubValue(process.env.NEXT_PUBLIC_ADMOB_INLINE_SLOT) || defaultSlot,
  sidebar: scrubValue(process.env.NEXT_PUBLIC_ADMOB_SIDEBAR_SLOT) || defaultSlot,
};

export const getAdMobClientId = () => admobClientId;

export const getAdMobSlot = (placement: AdPlacement) => slotMap[placement] ?? defaultSlot;

export const hasAdMobConfig = (placement: AdPlacement) => Boolean(admobClientId && getAdMobSlot(placement));
