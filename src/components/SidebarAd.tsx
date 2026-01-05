'use client';

import { useEffect, useRef, useState } from 'react';

import AdMobSlot from '@/components/AdMobSlot';
import { getAdMobSlot, hasAdMobConfig } from '@/lib/ads/loader';
import { trackAdImpression } from '@/lib/metrics/client';

const sidebarSlotId = getAdMobSlot('sidebar');
const sidebarConfigured = hasAdMobConfig('sidebar') && Boolean(sidebarSlotId);

const SidebarAd = () => {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!sidebarConfigured) return () => undefined;
    const el = containerRef.current;
    if (!el) return () => undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
          }
        });
      },
      { rootMargin: '0px', threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sidebarConfigured || !visible) {
      return;
    }
    trackAdImpression('sidebar');
  }, [visible]);

  if (!sidebarConfigured) {
    return null;
  }

  return (
    <aside
      className={`sidebar-ad${visible ? '' : ' placeholder'}`}
      aria-hidden={!visible}
      ref={containerRef}
      role="complementary"
    >
      {visible && (
        <AdMobSlot
          slotId={sidebarSlotId}
          className="sidebar-ad-slot"
          adLabel="Sponsored"
          style={{ display: 'block', minHeight: '250px' }}
        />
      )}
    </aside>
  );
};

export default SidebarAd;
