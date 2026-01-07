'use client';

import { CSSProperties, useEffect, useRef } from 'react';

import { getAdMobClientId } from '@/lib/ads/loader';
import { logAdError, logAdWarning, logAdInfo } from '@/lib/logger';

const ADMOB_CLIENT_ID = getAdMobClientId();

const ensureAdMobScript = () => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!ADMOB_CLIENT_ID) {
    logAdWarning('script', 'AdMob client ID not configured', { clientId: ADMOB_CLIENT_ID });
    return Promise.resolve();
  }
  if (window.__admobScriptPromise) {
    return window.__admobScriptPromise;
  }
  
  logAdInfo('script', 'Loading AdMob script');
  
  window.__admobScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-admob-loader="true"]');
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        logAdInfo('script', 'AdMob script already loaded');
        resolve();
      } else {
        existing.addEventListener('load', () => {
          logAdInfo('script', 'AdMob script loaded successfully');
          resolve();
        });
        existing.addEventListener('error', () => {
          logAdError('script', 'Failed to load', { url: existing.src });
          reject(new Error('AdMob script failed to load'));
        });
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
      logAdInfo('script', 'AdMob script loaded successfully');
      resolve();
    });
    script.addEventListener('error', () => {
      logAdError('script', 'Network error loading AdMob script', { 
        url: script.src,
        clientId: ADMOB_CLIENT_ID 
      });
      reject(new Error('AdMob script failed to load'));
    });
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
      if (!ADMOB_CLIENT_ID) {
        logAdWarning(slotId || 'unknown', 'Missing ADMOB_CLIENT_ID in environment');
      } else if (!slotId) {
        logAdWarning('unknown', 'Missing slot ID for ad placement');
      }
      return;
    }
    let cancelled = false;
    
    logAdInfo(slotId, `Initializing ad slot`);
    
    ensureAdMobScript()
      .then(() => {
        if (cancelled) return;
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          logAdInfo(slotId, 'Ad request sent successfully');
        } catch (error) {
          logAdError(slotId, 'Failed to request ad', {
            error: error instanceof Error ? error.message : String(error),
            clientId: ADMOB_CLIENT_ID,
          });
        }
      })
      .catch((error) => {
        logAdError(slotId, 'Script loading failed', {
          error: error instanceof Error ? error.message : String(error),
          clientId: ADMOB_CLIENT_ID,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [slotId]);

  if (!ADMOB_CLIENT_ID || !slotId) {
    // Hide completely - no spacing, no placeholder
    return null;
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
