'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AuthBadge from '@/components/AuthBadge';
import GuestModeNotice from '@/components/GuestModeNotice';
import InlineAd from '@/components/InlineAd';
import InteractionBar from '@/components/InteractionBar';
import LoaderSkeleton from '@/components/LoaderSkeleton';
import PreferencesPanel from '@/components/PreferencesPanel';
import ProductCard from '@/components/ProductCard';
import SearchBar from '@/components/SearchBar';
import SidebarAd from '@/components/SidebarAd';
import { useAuthClient } from '@/hooks/useAuthClient';
import { useFeedLearning } from '@/hooks/useFeedLearning';
import { useHaptics } from '@/hooks/useHaptics';
import { usePreloadQueue } from '@/hooks/usePreloadQueue';
import { useToast } from '@/hooks/useToast';
import { useUserSettings } from '@/hooks/useUserSettings';
import { deriveSearchWeights, mergeSearchIntoPreferences } from '@/lib/feed/engine';
import { eraseAllLocalState } from '@/lib/preferences/storage';
import { ProductContent } from '@/types/product';

const SUPPRESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const SUPPRESSION_MAX_ATTEMPTS = 5;
const HISTORY_LIMIT = 10;
const FUTURE_LIMIT = 10;
const SEARCH_PERSISTENCE = 5;

const FeedShell = () => {
  const { session, status: authStatus, login, logout } = useAuthClient();
  const { preferences, history, recordInteraction, recordSearch, resetHistory, resetPreferences } = useFeedLearning();
  const { vibrate } = useHaptics();
  const { settings, updateSettings, resetSettings } = useUserSettings();
  const { pushToast } = useToast();
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [, setSearchBoostRemaining] = useState(0);
  const [currentProduct, setCurrentProduct] = useState<ProductContent | null>(null);
  const [past, setPast] = useState<ProductContent[]>([]);
  const [future, setFuture] = useState<ProductContent[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isErasing, setIsErasing] = useState(false);

  const mergedPreferences = useMemo(() => {
    if (!searchTerms.length) return preferences;
    return mergeSearchIntoPreferences(preferences, searchTerms);
  }, [preferences, searchTerms]);

  const lastViewed = useMemo(() => {
    const recent = [...past.slice(-2), currentProduct].filter(Boolean) as ProductContent[];
    return recent.slice(-3);
  }, [past, currentProduct]);

  const generationPayload = useMemo(
    () => ({
      sessionId: session?.sessionId ?? 'guest-session',
      userId: session?.userId ?? 'guest',
      preferences: mergedPreferences,
      searchTerms,
      lastViewed,
      preferStaticDataset: settings.preferStaticDataset,
    }),
    [session, mergedPreferences, searchTerms, lastViewed, settings.preferStaticDataset]
  );

  const { queue, consumeNext, loading, status: queueStatus, lastError, isOffline, refresh } = usePreloadQueue({
    ...generationPayload,
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.reduceMotion = settings.reducedMotionMode ? 'true' : 'false';
  }, [settings.reducedMotionMode]);

  const isSuppressed = useCallback(
    (productId: string) => {
      const viewTimestamp = history.viewTimestamps?.[productId];
      if (!viewTimestamp) return false;
      const viewedAt = new Date(viewTimestamp).getTime();
      if (!Number.isFinite(viewedAt)) return false;
      return Date.now() - viewedAt < SUPPRESSION_WINDOW_MS;
    },
    [history.viewTimestamps]
  );

  const hydrateNext = useCallback(() => {
    let attempts = 0;
    let next = consumeNext();
    while (next && isSuppressed(next.id) && attempts < SUPPRESSION_MAX_ATTEMPTS) {
      attempts += 1;
      next = consumeNext();
    }
    if (!next) return;
    if (currentProduct) {
      setPast((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), currentProduct]);
    }
    setFuture([]);
    setCurrentProduct(next);
    recordInteraction(next, 'viewed');
    setSearchBoostRemaining((remaining) => {
      if (remaining <= 1) {
        setSearchTerms([]);
        return 0;
      }
      return remaining - 1;
    });
  }, [consumeNext, currentProduct, isSuppressed, recordInteraction]);

  useEffect(() => {
    if (!currentProduct && queue.length) {
      hydrateNext();
    }
  }, [queue, currentProduct, hydrateNext]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[feed] currentProduct', currentProduct?.id ?? 'none');
    }
  }, [currentProduct]);

  const handleInteraction = (type: 'liked' | 'disliked' | 'reported') => {
    if (!currentProduct) return;
    if (type === 'liked') vibrate([18, 30, 22]);
    if (type === 'disliked') vibrate([12, 20]);
    if (type === 'reported') vibrate([6, 24, 6, 24, 40]);
    recordInteraction(currentProduct, type);
    hydrateNext();
  };

  const handleSearch = (value: string) => {
    if (!value) {
      setSearchTerms([]);
      setSearchBoostRemaining(0);
      return;
    }
    vibrate(8);
    const weights = deriveSearchWeights(value);
    setSearchTerms(weights);
    setSearchBoostRemaining(SEARCH_PERSISTENCE);
    recordSearch(value, weights);
  };

  const handleBack = useCallback(() => {
    if (!currentProduct || past.length === 0) return;
    vibrate([8, 12]);
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [currentProduct, ...prev].slice(0, FUTURE_LIMIT));
    setCurrentProduct(previous);
  }, [currentProduct, past, vibrate]);

  const advanceFromFuture = useCallback(() => {
    if (!future.length) return false;
    const [next, ...rest] = future;
    if (currentProduct) {
      setPast((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), currentProduct]);
    }
    setFuture(rest);
    setCurrentProduct(next);
    return true;
  }, [future, currentProduct]);

  const nextWithHaptics = useCallback(() => {
    vibrate(10);
    if (advanceFromFuture()) {
      return;
    }
    hydrateNext();
  }, [vibrate, advanceFromFuture, hydrateNext]);

  const canGoBack = past.length > 0;
  const canGoForward = future.length > 0;

  const handleEraseAllData = useCallback(async () => {
    if (isErasing) return;
    setIsErasing(true);
    try {
      eraseAllLocalState();
      resetHistory();
      resetPreferences();
      resetSettings();
      setPast([]);
      setFuture([]);
      setCurrentProduct(null);
      setSearchTerms([]);
      setSearchBoostRemaining(0);
      await fetch('/api/data/erase', { method: 'POST' }).catch(() => undefined);
      await logout();
      refresh();
      pushToast({ tone: 'success', message: 'All local data cleared. Starting fresh.' });
    } catch (error) {
      console.error('[feed] failed to erase data', error);
      pushToast({ tone: 'danger', message: 'Unable to clear data. Please try again.' });
    } finally {
      setIsErasing(false);
    }
  }, [isErasing, resetHistory, resetPreferences, resetSettings, logout, refresh, pushToast]);

  return (
    <div className="feed-shell">
      <div className="feed-shell__header">
        <div>
          <h1>Product Pulse</h1>
          <p>One fresh product at a time. Signals adapt as you interact.</p>
        </div>
        <div className="feed-shell__actions">
          {session && (
            <AuthBadge
              mode={session.mode}
              name={session.name}
              email={session.email}
              onLogin={login}
              onLogout={logout}
            />
          )}
          <button type="button" className="button is-light" onClick={() => setPanelOpen(true)}>
            Controls
          </button>
        </div>
      </div>

      {(lastError || isOffline || queueStatus === 'retrying') && (
        <div className="feed-shell__status" role="status">
          {isOffline
            ? 'Offline mode: serving cached drops.'
            : lastError ?? 'Recovering the feed…'}
        </div>
      )}

      <SearchBar onSearch={handleSearch} />
      {session?.mode === 'guest' && <GuestModeNotice onLogin={login} />}

      <div className="feed-shell__content">
        <div className="feed-shell__primary">
          {!currentProduct || authStatus !== 'ready' ? (
            <LoaderSkeleton />
          ) : (
            <>
              <ProductCard product={currentProduct} />
              <InlineAd />
              <InteractionBar
                disabled={loading}
                onLike={() => handleInteraction('liked')}
                onDislike={() => handleInteraction('disliked')}
                onReport={() => handleInteraction('reported')}
                onNext={nextWithHaptics}
                onBack={handleBack}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
              />
            </>
          )}
        </div>
        <div className="feed-shell__secondary">
          <SidebarAd />
        </div>
      </div>

      <PreferencesPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        session={session}
        settings={settings}
        onUpdateSetting={updateSettings}
        history={history}
        onResetHistory={resetHistory}
        onResetPreferences={resetPreferences}
        onEraseAllData={handleEraseAllData}
        eraseInProgress={isErasing}
      />
    </div>
  );
};

export default FeedShell;
