'use client';

import { CSSProperties, useEffect, useRef } from 'react';

import { getAdMobClientId } from '@/lib/ads/loader';

const ADMOB_CLIENT_ID = getAdMobClientId();

const ensureAdMobScript = () => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!ADMOB_CLIENT_ID) return Promise.resolve();
  if (window.__admobScriptPromise) {
    return window.__admobScriptPromise;
  }
  window.__admobScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-admob-loader="true"]');
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('AdMob script failed to load')));
      }
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
      ADMOB_CLIENT_ID
    )}`;
    script.crossOrigin = 'anonymous';
    script.dataset.admobLoader = 'true';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error('AdMob script failed to load')));
    document.head.appendChild(script);
  });
  return window.__admobScriptPromise;
};

export type AdMobSlotProps = {
  slotId?: string;
  adLabel?: string;
  className?: string;
  style?: CSSProperties;
  format?: 'auto' | 'fluid' | 'rectangle';
  fullWidthResponsive?: boolean;
};

const AdMobSlot = ({
  slotId,
  adLabel = 'Advertisement',
  className,
  style,
  format = 'auto',
  fullWidthResponsive = true,
}: AdMobSlotProps) => {
  const insRef = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    if (!ADMOB_CLIENT_ID || !slotId || !insRef.current) {
      return;
    }
    let cancelled = false;
    ensureAdMobScript()
      .then(() => {
        if (cancelled) return;
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
          console.warn('[admob] unable to request ad slot', error);
        }
      })
      .catch((error) => console.warn('[admob] script failed to load', error));
    return () => {
      cancelled = true;
    };
  }, [slotId]);

  if (!ADMOB_CLIENT_ID || !slotId) {
    return (
      <div className={className ?? ''} role="complementary" aria-label="Ad placeholder">
        <div className="ad-placeholder">
          <strong>Ad slot pending setup</strong>
          <p>Define NEXT_PUBLIC_ADMOB_CLIENT_ID and slot ids in .env.local to serve ads.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className ?? ''} role="complementary">
      {adLabel && <span className="ad-label">{adLabel}</span>}
      <ins
        className="adsbygoogle"
        style={style ?? { display: 'block' }}
        data-ad-client={ADMOB_CLIENT_ID}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
        data-adtest={process.env.NODE_ENV !== 'production' ? 'on' : undefined}
        ref={insRef}
      />
    </div>
  );
};

export default AdMobSlot;
