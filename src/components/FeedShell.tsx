'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AuthBadge from '@/components/AuthBadge';
import GuestModeNotice from '@/components/GuestModeNotice';
import FeedErrorCard from '@/components/FeedErrorCard';
import InlineAd from '@/components/InlineAd';
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
import { AdPlacement, hasAdMobConfig } from '@/lib/ads/loader';
import { deriveSearchWeights, mergeSearchIntoPreferences, Interaction } from '@/lib/feed/engine';
import { eraseAllLocalState } from '@/lib/preferences/storage';
import { ProductContent } from '@/types/product';
import { adLogger, uiLogger } from '@/lib/logger';

const SUPPRESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const SUPPRESSION_MAX_ATTEMPTS = 5;
const HISTORY_LIMIT = 10;
const FUTURE_LIMIT = 10;

const FeedShell = () => {
  const { session, status: authStatus, login, logout } = useAuthClient();
  const { preferences, history, recordInteraction, recordSearch, recordSave, resetHistory, resetPreferences } = useFeedLearning();
  const { vibrate } = useHaptics();
  const { settings, updateSettings, resetSettings } = useUserSettings();
  const { pushToast } = useToast();
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [currentProduct, setCurrentProduct] = useState<ProductContent | null>(null);
  const [compareProduct, setCompareProduct] = useState<ProductContent | null>(null);
  const [past, setPast] = useState<ProductContent[]>([]);
  const [future, setFuture] = useState<ProductContent[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const blockedProductsRef = useRef<Set<string>>(new Set());
  const canPersonalize = session?.mode === 'google';

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
      resultsRequested: 2,
    }),
    [session, mergedPreferences, searchTerms, lastViewed]
  );

  const { queue, consumeNext, loading, status: queueStatus, lastError, isOffline, refresh } =
    usePreloadQueue(generationPayload);
  const queueLength = queue.length;

  useEffect(() => {
    // Log ad configuration status for anyone who opens console (F12)
    const placements: AdPlacement[] = ['footer', 'inline', 'sidebar'];
    placements.forEach((placement) => {
      if (!hasAdMobConfig(placement)) {
        adLogger.warn(`${placement} slot disabled`, { reason: 'Missing AdMob environment variables' });
      } else {
        adLogger.info(`${placement} slot configured`, { placement });
      }
    });
  }, []);

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

  const takeNextProduct = useCallback(() => {
    let attempts = 0;
    let next = consumeNext();
    while (
      next &&
      (isSuppressed(next.id) || blockedProductsRef.current.has(next.id)) &&
      attempts < SUPPRESSION_MAX_ATTEMPTS
    ) {
      attempts += 1;
      next = consumeNext();
    }
    return next ?? null;
  }, [consumeNext, isSuppressed]);

  const commitView = useCallback(
    (product: ProductContent) => {
      if (canPersonalize) {
        recordInteraction(product, 'viewed');
      }
    },
    [canPersonalize, recordInteraction]
  );

  const hydratePrimary = useCallback(() => {
    const next = takeNextProduct();
    if (!next) return false;
    if (currentProduct) {
      setPast((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), currentProduct]);
    }
    setFuture([]);
    setCurrentProduct(next);
    commitView(next);
    return true;
  }, [takeNextProduct, currentProduct, commitView]);

  const hydrateComparison = useCallback(() => {
    const candidate = takeNextProduct();
    setCompareProduct(candidate ?? null);
  }, [takeNextProduct]);

  useEffect(() => {
    if (!currentProduct && queueLength) {
      const hydrated = hydratePrimary();
      if (hydrated) {
        setCompareProduct(null);
        hydrateComparison();
      }
    }
  }, [queueLength, currentProduct, hydratePrimary, hydrateComparison]);

  useEffect(() => {
    if (currentProduct && !compareProduct && queueLength) {
      hydrateComparison();
    }
  }, [currentProduct, compareProduct, queueLength, hydrateComparison]);

  const promoteComparison = useCallback(
    (withHaptics = true) => {
      if (!compareProduct) return false;
      if (withHaptics) {
        vibrate([10, 8]);
      }
      if (currentProduct) {
        setPast((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), currentProduct]);
      }
      setFuture([]);
      setCurrentProduct(compareProduct);
      commitView(compareProduct);
      setCompareProduct(null);
      hydrateComparison();
      return true;
    },
    [compareProduct, currentProduct, commitView, hydrateComparison, vibrate]
  );

  const blockProduct = useCallback((productId: string) => {
    blockedProductsRef.current.add(productId);
  }, []);

  const resetDeckState = useCallback(() => {
    setPast([]);
    setFuture([]);
    setCurrentProduct(null);
    setCompareProduct(null);
  }, []);

  const handleSearch = useCallback(
    (rawValue: string) => {
      const value = rawValue.trim();
      if (!value) {
        setActiveSearch(null);
        setSearchTerms([]);
        resetDeckState();
        refresh();
        return;
      }
      vibrate(8);
      const weights = deriveSearchWeights(value);
      setActiveSearch(value);
      setSearchTerms(weights);
      resetDeckState();
      if (canPersonalize) {
        recordSearch(value, weights);
      }
      refresh();
    },
    [canPersonalize, recordSearch, refresh, resetDeckState, vibrate]
  );

  const handleBack = useCallback(() => {
    if (!currentProduct || past.length === 0) return;
    vibrate([8, 12]);
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [currentProduct, ...prev].slice(0, FUTURE_LIMIT));
    setCurrentProduct(previous);
    setCompareProduct(null);
    hydrateComparison();
  }, [currentProduct, past, vibrate, hydrateComparison]);

  const advanceFromFuture = useCallback(() => {
    if (!future.length) return false;
    const [next, ...rest] = future;
    if (currentProduct) {
      setPast((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), currentProduct]);
    }
    setFuture(rest);
    setCurrentProduct(next);
    setCompareProduct(null);
    hydrateComparison();
    return true;
  }, [future, currentProduct, hydrateComparison]);

  const nextFromQueue = useCallback(
    (withHaptics = true) => {
      if (withHaptics) {
        vibrate(10);
      }
      if (advanceFromFuture()) {
        return;
      }
      if (promoteComparison(false)) {
        return;
      }
      const hydrated = hydratePrimary();
      if (hydrated) {
        hydrateComparison();
      }
    },
    [advanceFromFuture, promoteComparison, hydratePrimary, hydrateComparison, vibrate]
  );

  const persistInteraction = useCallback(
    (product: ProductContent, interaction: Interaction) => {
      if (canPersonalize) {
        recordInteraction(product, interaction);
      }
    },
    [canPersonalize, recordInteraction]
  );

  const handlePrimaryReaction = useCallback(
    (type: 'liked' | 'disliked' | 'reported') => {
      if (!currentProduct) return;
      if (type === 'liked') {
        vibrate([18, 30, 22]);
        persistInteraction(currentProduct, 'liked');
        setCompareProduct(null);
        hydrateComparison();
        return;
      }
      if (type === 'disliked') {
        vibrate([12, 20]);
        blockProduct(currentProduct.id);
        persistInteraction(currentProduct, 'disliked');
      } else {
        vibrate([6, 24, 6, 24, 40]);
        blockProduct(currentProduct.id);
        persistInteraction(currentProduct, 'reported');
      }
      nextFromQueue(false);
    },
    [blockProduct, currentProduct, hydrateComparison, nextFromQueue, persistInteraction, vibrate]
  );

  const handleComparisonReaction = useCallback(
    (type: 'liked' | 'disliked' | 'reported') => {
      if (!compareProduct) return;
      if (type === 'liked') {
        vibrate([14, 18]);
        persistInteraction(compareProduct, 'liked');
        promoteComparison(false);
        return;
      }
      if (type === 'disliked') {
        vibrate(12);
        blockProduct(compareProduct.id);
        persistInteraction(compareProduct, 'disliked');
      } else {
        vibrate([6, 18, 6]);
        blockProduct(compareProduct.id);
        persistInteraction(compareProduct, 'reported');
      }
      setCompareProduct(null);
      hydrateComparison();
    },
    [blockProduct, compareProduct, hydrateComparison, persistInteraction, promoteComparison, vibrate]
  );

  const handleSaveProduct = useCallback(
    (product: ProductContent) => {
      if (!product) return;
      if (!canPersonalize) {
        pushToast({ tone: 'info', message: 'Sign in to save picks to your account.' });
        return;
      }
      recordSave(product);
      pushToast({ tone: 'success', message: `${product.title} saved to your locker.` });
    },
    [canPersonalize, pushToast, recordSave]
  );

  const canGoBack = past.length > 0;
  const canGoForward = future.length > 0 || Boolean(compareProduct) || queueLength > 0;

  const showLoader = !currentProduct;
  const hasCachedDeck = Boolean(currentProduct) || past.length > 0 || queueLength > 0;
  const loaderStatus = queueStatus === 'retrying' ? 'Recovering product queue…' : 'Pairing contenders…';
  const cachedFallbackMessage = 'Showing saved picks from this device while systems reset.';
  const emptyFallbackMessage = 'Fresh contenders are lining up—hang tight.';
  const fallbackLoaderMessage = hasCachedDeck ? cachedFallbackMessage : emptyFallbackMessage;
  const loaderDetail =
    authStatus !== 'ready'
      ? 'Syncing session and preferences before loading the deck.'
      : isOffline
        ? 'Offline mode: serving cached drops until connection resumes.'
        : fallbackLoaderMessage;
  const blockingMessage = isOffline ? 'You appear to be offline. Reconnect to load fresh contenders.' : null;
  const showErrorCard = showLoader && !loading && Boolean(blockingMessage);
  const statusBannerMessage = isOffline ? 'Offline mode: serving cached drops.' : fallbackLoaderMessage;

  const renderSlot = (
    label: string,
    product: ProductContent | null,
    slot: 'primary' | 'comparison',
    onReact: (type: 'liked' | 'disliked' | 'reported') => void
  ) => (
    <section className="dual-slot" data-slot={slot} aria-live="polite">
      <div className="dual-slot__header">
        <div>
          <span>{slot === 'primary' ? 'Spotlight' : 'Challenger'}</span>
          <strong>{label}</strong>
        </div>
      </div>
      {product ? (
        <>
          <ProductCard product={product} variant={slot} />
          <div className="dual-slot__actions">
            <button type="button" className="button is-success is-light" onClick={() => onReact('liked')}>
              👍 Like
            </button>
            <button type="button" className="button is-warning is-light" onClick={() => onReact('disliked')}>
              👎 Dislike
            </button>
            <button
              type="button"
              className="button is-link is-light"
              onClick={() => handleSaveProduct(product)}
              disabled={!canPersonalize}
              title={canPersonalize ? undefined : 'Sign in to save favorites'}
            >
              💾 Save
            </button>
            <button type="button" className="button is-danger is-light" onClick={() => onReact('reported')}>
              🚩 Report
            </button>
          </div>
        </>
      ) : (
        <div className="dual-slot__empty">Fetching another product…</div>
      )}
    </section>
  );

  const handleEraseAllData = useCallback(async () => {
    if (isErasing) return;
    setIsErasing(true);
    try {
      eraseAllLocalState();
      resetHistory();
      resetPreferences();
      resetSettings();
      blockedProductsRef.current.clear();
      resetDeckState();
      setSearchTerms([]);
      setActiveSearch(null);
      await fetch('/api/data/erase', { method: 'POST' }).catch(() => undefined);
      await logout();
      refresh();
      pushToast({ tone: 'success', message: 'All local data cleared. Starting fresh.' });
    } catch (error) {
      uiLogger.error('failed to erase data', {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      pushToast({ tone: 'danger', message: 'Unable to clear data. Please try again.' });
    } finally {
      setIsErasing(false);
    }
  }, [
    blockedProductsRef,
    isErasing,
    logout,
    pushToast,
    refresh,
    resetDeckState,
    resetHistory,
    resetPreferences,
    resetSettings,
  ]);

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
          {statusBannerMessage}
        </div>
      )}

      <SearchBar onSearch={handleSearch} activeQuery={activeSearch ?? undefined} onClear={() => handleSearch('')} />
      {!canPersonalize && (
        <div className="feed-shell__status feed-shell__status--info" role="status">
          Sign in to keep training data and save favorites across sessions.
        </div>
      )}
      {session?.mode === 'guest' && <GuestModeNotice onLogin={login} />}

      <div className="feed-shell__content">
        <div className="feed-shell__primary">
          {showLoader ? (
            showErrorCard && blockingMessage ? (
              <FeedErrorCard
                message={blockingMessage}
                onRetry={() => refresh()}
                onShowDiagnostics={() => setPanelOpen(true)}
                busy={queueStatus === 'loading'}
                isOffline={isOffline}
                showDiagnostics={false}
              />
            ) : (
              <LoaderSkeleton status={loaderStatus} detail={loaderDetail} />
            )
          ) : (
            <>
              <div className="dual-deck">
                {renderSlot('Keep or trade this pick', currentProduct, 'primary', handlePrimaryReaction)}
                {renderSlot('Find a rival to compare', compareProduct, 'comparison', handleComparisonReaction)}
              </div>
              <InlineAd />
              <div className="dual-deck__nav">
                <button type="button" className="button is-light" onClick={handleBack} disabled={!canGoBack}>
                  ⏮ Back
                </button>
                <button
                  type="button"
                  className="button is-info is-light"
                  onClick={() => nextFromQueue(true)}
                  disabled={!canGoForward || loading}
                >
                  ⏭ New matchup
                </button>
              </div>
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
