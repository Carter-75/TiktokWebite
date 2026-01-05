export type AdPlacement = 'footer' | 'inline' | 'sidebar';

const admobClientId = process.env.NEXT_PUBLIC_ADMOB_CLIENT_ID ?? '';
const defaultSlot = process.env.NEXT_PUBLIC_ADMOB_DEFAULT_SLOT ?? '';

const slotMap: Record<AdPlacement, string> = {
  footer: process.env.NEXT_PUBLIC_ADMOB_FOOTER_SLOT ?? defaultSlot,
  inline: process.env.NEXT_PUBLIC_ADMOB_INLINE_SLOT ?? defaultSlot,
  sidebar: process.env.NEXT_PUBLIC_ADMOB_SIDEBAR_SLOT ?? defaultSlot,
};

export const getAdMobClientId = () => admobClientId;

export const getAdMobSlot = (placement: AdPlacement) => slotMap[placement] ?? defaultSlot;

export const hasAdMobConfig = (placement: AdPlacement) => Boolean(getAdMobClientId() && getAdMobSlot(placement));
