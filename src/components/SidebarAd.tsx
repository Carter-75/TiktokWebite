'use client';

import { useEffect, useState } from 'react';

import { trackAdImpression } from '@/lib/metrics/client';

const SidebarAd = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
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
    const el = document.querySelector('.sidebar-ad');
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (visible) {
      trackAdImpression('sidebar');
    }
  }, [visible]);

  if (!visible) {
    return <aside className="sidebar-ad placeholder" aria-hidden />;
  }

  return (
    <aside className="sidebar-ad" role="complementary">
      <strong>Partner Spotlight</strong>
      <p>Brands can showcase launches here. Delivered with zero third-party cookies.</p>
      <a className="button is-small" href="https://example.com/ads" target="_blank" rel="noreferrer">
        Learn more
      </a>
    </aside>
  );
};

export default SidebarAd;
