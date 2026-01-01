"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./page.module.css";

type Player = {
  id: number;
  name: string;
  balance: number;
  color: string;
};

type TransferRecord = {
  id: string;
  timestamp: number;
  amount: number;
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
};
const revertTransactions = (
  players: Player[],
  taxBalance: number,
  history: TransferRecord[],
  targetId: string
) => {
  const playerMap = new Map(players.map((player) => [playerKey(player.id), { ...player }]));
  let nextTax = taxBalance;

  const targetIndex = history.findIndex((record) => record.id === targetId);
  if (targetIndex === -1) {
    return { players, taxBalance, history };
  }

  const recordsToRevert = history.slice(0, targetIndex + 1);

  recordsToRevert.forEach((record) => {
    const { amount, sourceId, targetId: toId } = record;

    if (sourceId === BANK_ID) {
      if (toId === TAX_ID) {
        nextTax -= amount;
      } else {
        const targetPlayer = playerMap.get(toId);
        if (targetPlayer) {
          targetPlayer.balance -= amount;
        }
      }
      return;
    }

    if (toId === BANK_ID) {
      if (sourceId === TAX_ID) {
        nextTax += amount;
      } else {
        const sourcePlayer = playerMap.get(sourceId);
        if (sourcePlayer) {
          sourcePlayer.balance += amount;
        }
      }
      return;
    }

    if (sourceId === TAX_ID) {
      const targetPlayer = playerMap.get(toId);
      if (targetPlayer) {
        targetPlayer.balance -= amount;
      }
      nextTax += amount;
      return;
    }

    if (toId === TAX_ID) {
      const sourcePlayer = playerMap.get(sourceId);
      if (sourcePlayer) {
        sourcePlayer.balance += amount;
      }
      nextTax -= amount;
      return;
    }

    const sourcePlayer = playerMap.get(sourceId);
    const targetPlayer = playerMap.get(toId);
    if (sourcePlayer) {
      sourcePlayer.balance += amount;
    }
    if (targetPlayer) {
      targetPlayer.balance -= amount;
    }
  });

  const truncatedHistory = history.slice(targetIndex + 1);
  return {
    players: players.map((player) => playerMap.get(playerKey(player.id)) ?? player),
    taxBalance: nextTax,
    history: truncatedHistory,
  };
};

const DENOMINATIONS = [1, 5, 10, 20, 50, 100, 500];
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const STARTING_BALANCE = 1500;
const BANK_ID = "bank";
const TAX_ID = "tax";
const PLAYER_COLORS = ["#fbbf24", "#7dd3fc", "#c084fc", "#f472b6"] as const;
const STORAGE_KEY = "monopoly-banker-v1";
const GAIN_COLOR = "#34d399";
const LOSS_COLOR = "#f87171";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const playerKey = (id: number) => `player-${id}`;

const createPlayer = (id: number): Player => ({
  id,
  name: `Player ${id}`,
  balance: STARTING_BALANCE,
  color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
});

const buildDefaultPlayers = (count: number = MAX_PLAYERS) =>
  Array.from({ length: count }, (_, index) => createPlayer(index + 1));

const sanitizePlayers = (maybePlayers: unknown): Player[] => {
  if (!Array.isArray(maybePlayers)) {
    return buildDefaultPlayers(MAX_PLAYERS);
  }

  const trimmed = maybePlayers.slice(0, MAX_PLAYERS);
  const normalizedLength = Math.min(
    Math.max(trimmed.length, MIN_PLAYERS),
    MAX_PLAYERS
  );

  const sanitized = Array.from({ length: normalizedLength }, (_, index) => {
    const source = trimmed[index] ?? {};
    const id = index + 1;
    const providedName =
      typeof source.name === "string" ? source.name.trim() : "";
    const balanceRaw = Number(source.balance);
    const balance = Number.isFinite(balanceRaw)
      ? Math.max(0, Math.round(balanceRaw))
      : STARTING_BALANCE;

    return {
      id,
      name: providedName === "" ? `Player ${id}` : providedName,
      balance,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    };
  });

  return sanitized;
};

const sanitizeHistory = (maybeHistory: unknown): TransferRecord[] => {
  if (!Array.isArray(maybeHistory)) {
    return [];
  }

  const fallbackBase = Date.now().toString(36);
  const sanitized: TransferRecord[] = [];

  maybeHistory.slice(0, 10).forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      return;
    }
    const amountRaw = Number((entry as Record<string, unknown>).amount);
    const timestampRaw = Number((entry as Record<string, unknown>).timestamp);
    const sourceIdRaw = (entry as Record<string, unknown>).sourceId;
    const targetIdRaw = (entry as Record<string, unknown>).targetId;
    const sourceNameRaw = (entry as Record<string, unknown>).sourceName;
    const targetNameRaw = (entry as Record<string, unknown>).targetName;

    if (
      !Number.isFinite(amountRaw) ||
      amountRaw <= 0 ||
      typeof sourceIdRaw !== "string" ||
      typeof targetIdRaw !== "string"
    ) {
      return;
    }

    sanitized.push({
      id:
        typeof (entry as Record<string, unknown>).id === "string"
          ? ((entry as Record<string, unknown>).id as string)
          : `${fallbackBase}-${index}`,
      timestamp: Number.isFinite(timestampRaw) ? timestampRaw : Date.now(),
      amount: Math.round(amountRaw),
      sourceId: sourceIdRaw,
      targetId: targetIdRaw,
      sourceName:
        typeof sourceNameRaw === "string" && sourceNameRaw.trim() !== ""
          ? sourceNameRaw
          : sourceIdRaw,
      targetName:
        typeof targetNameRaw === "string" && targetNameRaw.trim() !== ""
          ? targetNameRaw
          : targetIdRaw,
    });
  });

  return sanitized;
};

const formatTimestamp = (value: number) =>
  timeFormatter.format(new Date(value));

export default function Home() {
  const [players, setPlayers] = useState<Player[]>(() =>
    buildDefaultPlayers(MAX_PLAYERS)
  );
  const [taxBalance, setTaxBalance] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [customAmount, setCustomAmount] = useState("");
  const [sourceId, setSourceId] = useState<string>(BANK_ID);
  const [targetId, setTargetId] = useState<string>(playerKey(1));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [recentHighlight, setRecentHighlight] = useState<{
    source: string | null;
    target: string | null;
  }>({ source: null, target: null });

  const nameResetTimers = useRef<
    Partial<Record<number, ReturnType<typeof setTimeout>>>
  >({});
  const recentHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const activePlayers = players;

  const clearScheduledReset = (id: number) => {
    const pending = nameResetTimers.current[id];
    if (pending) {
      clearTimeout(pending);
      delete nameResetTimers.current[id];
    }
  };

  const scheduleNameReset = (id: number) => {
    clearScheduledReset(id);
    nameResetTimers.current[id] = setTimeout(() => {
      setPlayers((previous) =>
        previous.map((player) =>
          player.id === id && player.name.trim() === ""
            ? { ...player, name: `Player ${id}` }
            : player
        )
      );
      delete nameResetTimers.current[id];
    }, 3000);
  };

  const clearAllNameResetTimers = useCallback(() => {
    Object.values(nameResetTimers.current).forEach((timer) => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  }, [nameResetTimers]);

  const handlePlayerCountChange = (count: number) => {
    const normalized = Math.min(Math.max(count, MIN_PLAYERS), MAX_PLAYERS);
    setPlayers((previous) => {
      if (normalized > previous.length) {
        const additions = Array.from(
          { length: normalized - previous.length },
          (_, index) => createPlayer(previous.length + index + 1)
        );
        return [...previous, ...additions];
      }
      if (normalized < previous.length) {
        return previous.slice(0, normalized);
      }
      return previous;
    });
  };

  const playerCount = activePlayers.length;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      const nextPlayers = sanitizePlayers(parsed?.players);
      const parsedTax = Number(parsed?.taxBalance);
      const nextTax = Number.isFinite(parsedTax)
        ? Math.max(0, Math.round(parsedTax))
        : 0;
      setPlayers(nextPlayers);
      setTaxBalance(nextTax);
      const nextHistory = sanitizeHistory(parsed?.history);
      setHistory(nextHistory);
    } catch (error) {
      console.warn("Failed to load Monopoly banker state", error);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded || typeof window === "undefined") {
      return;
    }
    try {
      const payload = JSON.stringify({ players, taxBalance, history });
      window.localStorage.setItem(STORAGE_KEY, payload);
    } catch (error) {
      console.warn("Failed to persist Monopoly banker state", error);
    }
  }, [players, taxBalance, history, hasLoaded]);

  useEffect(() => {
    return () => {
      clearAllNameResetTimers();
      if (recentHighlightTimer.current) {
        clearTimeout(recentHighlightTimer.current);
      }
    };
  }, [clearAllNameResetTimers]);

  useEffect(() => {
    const playerIds = new Set(
      activePlayers.map((player) => playerKey(player.id))
    );
    if (!playerIds.has(sourceId) && sourceId !== BANK_ID && sourceId !== TAX_ID) {
      const fallback = playerIds.values().next().value ?? BANK_ID;
      setSourceId(fallback);
    }
    if (!playerIds.has(targetId) && targetId !== BANK_ID && targetId !== TAX_ID) {
      const fallback = playerIds.values().next().value ?? TAX_ID;
      setTargetId(fallback);
    }
  }, [activePlayers, sourceId, targetId]);

  useEffect(() => {
    const activeIds = new Set(activePlayers.map((player) => player.id));
    Object.keys(nameResetTimers.current).forEach((key) => {
      const id = Number(key);
      if (!activeIds.has(id)) {
        clearScheduledReset(id);
      }
    });
  }, [activePlayers]);

  const playerOptions = activePlayers.map((player) => ({
    value: playerKey(player.id),
    label: `${player.name} (${formatCurrency(player.balance)})`,
  }));

  const accountOptions = [
    ...playerOptions,
    { value: TAX_ID, label: `Tax Pile (${formatCurrency(taxBalance)})` },
    { value: BANK_ID, label: "Bank (unlimited)" },
  ];

  const pendingPreviewActive =
    pendingAmount > 0 && sourceId !== targetId && hasLoaded;
  const highlightSourceId = pendingPreviewActive
    ? sourceId
    : recentHighlight.source;
  const highlightTargetId = pendingPreviewActive
    ? targetId
    : recentHighlight.target;
  const highlightMode = pendingPreviewActive
    ? "pending"
    : recentHighlight.source || recentHighlight.target
    ? "recent"
    : null;

  const shortAccountLabel = (id: string) => {
    if (id === BANK_ID) {
      return "Bank";
    }
    if (id === TAX_ID) {
      return "Tax Pile";
    }
    const player = activePlayers.find((entry) => playerKey(entry.id) === id);
    return player ? player.name : "Player";
  };

  const handleRevertToHistory = (checkpointId: string) => {
    const result = revertTransactions(players, taxBalance, history, checkpointId);
    if (result.history === history) {
      return;
    }
    setPlayers(result.players);
    setTaxBalance(result.taxBalance);
    setHistory(result.history);
    setFeedback("Reverted to selected checkpoint.");
    setPendingAmount(0);
    setCustomAmount("");
    setSourceId(BANK_ID);
    setTargetId(playerKey(1));
  };

  const describeAccount = (id: string) => {
    if (id === BANK_ID) {
      return "the bank";
    }
    if (id === TAX_ID) {
      return "the tax pile";
    }
    const player = activePlayers.find((entry) => playerKey(entry.id) === id);
    return player ? player.name : "player";
  };

  const handlePlayerNameChange = (id: number, name: string) => {
    setPlayers((previous) =>
      previous.map((player) =>
        player.id === id
          ? {
              ...player,
              name,
            }
          : player
      )
    );

    if (name.trim() === "") {
      scheduleNameReset(id);
    } else {
      clearScheduledReset(id);
    }
  };

  const adjustPendingAmount = (delta: number) => {
    setPendingAmount((previous) => Math.max(0, previous + delta));
    setFeedback(null);
  };

  const handleResetBoard = () => {
    clearAllNameResetTimers();
    const freshPlayers = buildDefaultPlayers(playerCount);
    setPlayers(freshPlayers);
    setTaxBalance(0);
    setPendingAmount(0);
    setCustomAmount("");
    setSourceId(BANK_ID);
    setTargetId(playerKey(1));
    setHistory([]);
    setRecentHighlight({ source: null, target: null });
    if (recentHighlightTimer.current) {
      clearTimeout(recentHighlightTimer.current);
      recentHighlightTimer.current = null;
    }
    setFeedback("Board reset to starting balances.");
  };

  const handleSwapAccounts = () => {
    if (sourceId === targetId) {
      return;
    }
    setSourceId(targetId);
    setTargetId(sourceId);
    setFeedback(null);
  };

  const applyCustomAmount = () => {
    const parsed = Number(customAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFeedback("Enter a positive custom amount.");
      return;
    }
    setPendingAmount(parsed);
    setFeedback(null);
  };

  const resetAmount = () => {
    setPendingAmount(0);
    setCustomAmount("");
    setFeedback(null);
  };

  const findPlayer = (id: string) =>
    activePlayers.find((player) => playerKey(player.id) === id);

  const canDebit = (accountId: string, amount: number) => {
    if (accountId === BANK_ID) {
      return true;
    }
    if (accountId === TAX_ID) {
      return taxBalance >= amount;
    }
    const player = findPlayer(accountId);
    return !!player && player.balance >= amount;
  };

  const handleTransaction = () => {
    if (pendingAmount <= 0) {
      setFeedback("Choose an amount greater than zero.");
      return;
    }
    if (sourceId === targetId) {
      setFeedback("Pick different source and destination accounts.");
      return;
    }
    if (!canDebit(sourceId, pendingAmount)) {
      setFeedback("Insufficient funds in the selected source.");
      return;
    }

    const sourceLabel = shortAccountLabel(sourceId);
    const targetLabel = shortAccountLabel(targetId);

    setPlayers((previous) =>
      previous.map((player) => {
        const key = playerKey(player.id);
        let nextBalance = player.balance;
        if (key === sourceId) {
          nextBalance -= pendingAmount;
        }
        if (key === targetId) {
          nextBalance += pendingAmount;
        }
        return nextBalance === player.balance
          ? player
          : { ...player, balance: nextBalance };
      })
    );

    if (sourceId === TAX_ID) {
      setTaxBalance((previous) => previous - pendingAmount);
    }
    if (targetId === TAX_ID) {
      setTaxBalance((previous) => previous + pendingAmount);
    }

    setHistory((previous) => {
      const record: TransferRecord = {
        id: `${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        timestamp: Date.now(),
        amount: pendingAmount,
        sourceId,
        targetId,
        sourceName: sourceLabel,
        targetName: targetLabel,
      };
      return [record, ...previous].slice(0, 10);
    });

    if (recentHighlightTimer.current) {
      clearTimeout(recentHighlightTimer.current);
    }
    setRecentHighlight({ source: sourceId, target: targetId });
    recentHighlightTimer.current = setTimeout(() => {
      setRecentHighlight({ source: null, target: null });
    }, 2500);

    setPendingAmount(0);
    setCustomAmount("");

    setFeedback(
      `Moved ${formatCurrency(pendingAmount)} from ${describeAccount(
        sourceId
      )} to ${describeAccount(targetId)}.`
    );
  };

  return (
    <main className={styles.main}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Quick cash flow tracker</p>
            <h1>Monopoly Banker</h1>
            <p className={styles.subtitle}>
              Track 2&ndash;4 players, the tax pile, and an unlimited bank. Start
              everyone with {formatCurrency(STARTING_BALANCE)} and keep the game
              moving without pencil math.
            </p>
          </div>
        </header>

        <div className={styles.layout}>
          <section className={styles.controls}>
            <div className={styles.card}>
              <div className={styles.fieldRow}>
                <label htmlFor="player-count">
                  Players: <strong>{playerCount}</strong>
                </label>
                <input
                  id="player-count"
                  type="range"
                  min={MIN_PLAYERS}
                  max={MAX_PLAYERS}
                  value={playerCount}
                  onChange={(event) =>
                    handlePlayerCountChange(Number(event.target.value))
                  }
                />
              </div>
              <p className={styles.helper}>
                Bank is unlimited, tax pile starts at {formatCurrency(0)}, each
                player starts at {formatCurrency(STARTING_BALANCE)}.
              </p>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.resetBoardButton}
                  onClick={handleResetBoard}
                >
                  Reset Board
                </button>
              </div>
            </div>

            <div className={styles.card}>
              <h2>Adjust names</h2>
              <div className={styles.playerFormGrid}>
                {activePlayers.map((player) => (
                  <label key={player.id} className={styles.playerField}>
                    <span className={styles.playerLabel}>
                      <span
                        className={styles.swatch}
                        style={{ backgroundColor: player.color }}
                        aria-hidden="true"
                      />
                      Player {player.id}
                    </span>
                    <input
                      value={player.name}
                      maxLength={24}
                      onChange={(event) =>
                        handlePlayerNameChange(player.id, event.target.value)
                      }
                    />
                    <small>{formatCurrency(player.balance)}</small>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.card}>
              <h2>Pick an amount</h2>
              <div className={styles.amountRow}>
                <div>
                  <p className={styles.amountLabel}>Pending amount</p>
                  <p className={styles.amountValue}>
                    {formatCurrency(pendingAmount)}
                  </p>
                </div>
                <button
                  className={styles.resetButton}
                  type="button"
                  onClick={resetAmount}
                >
                  Reset
                </button>
              </div>
              <div className={styles.denominationControls}>
                {DENOMINATIONS.map((value) => (
                  <div key={value} className={styles.denomination}>
                    <button
                      type="button"
                      onClick={() => adjustPendingAmount(-value)}
                    >
                      &minus;
                    </button>
                    <span>${value}</span>
                    <button
                      type="button"
                      onClick={() => adjustPendingAmount(value)}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
              <div className={styles.customAmount}>
                <label htmlFor="custom-amount">Custom amount</label>
                <div>
                  <input
                    id="custom-amount"
                    type="number"
                    min={1}
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value)}
                  />
                  <button type="button" onClick={applyCustomAmount}>
                    Use
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h2>Transfer money</h2>
              <div className={styles.transferGrid}>
                <label>
                  <span>From</span>
                  <div className={styles.selectWrapper}>
                    <select
                      value={sourceId}
                      onChange={(event) => setSourceId(event.target.value)}
                    >
                      {accountOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <div className={styles.swapCell}>
                  <button
                    type="button"
                    className={styles.swapButton}
                    onClick={handleSwapAccounts}
                  >
                    Swap
                  </button>
                </div>
                <label>
                  <span>To</span>
                  <div className={styles.selectWrapper}>
                    <select
                      value={targetId}
                      onChange={(event) => setTargetId(event.target.value)}
                    >
                      {accountOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
              <button
                className={styles.primary}
                type="button"
                onClick={handleTransaction}
              >
                Apply Transfer
              </button>
              {feedback && <p className={styles.feedback}>{feedback}</p>}
            </div>
          </section>

          <section className={styles.balances}>
            <div className={styles.card}>
              <h2>Live totals</h2>
              <div className={styles.balanceGrid}>
                {activePlayers.map((player) => {
                  const keyId = playerKey(player.id);
                  const isGain = highlightTargetId === keyId;
                  const isLoss = highlightSourceId === keyId;
                  const borderColor = isGain
                    ? GAIN_COLOR
                    : isLoss
                    ? LOSS_COLOR
                    : player.color;
                  const boxShadow = isGain
                    ? `0 18px 45px ${GAIN_COLOR}55`
                    : isLoss
                    ? `0 18px 45px ${LOSS_COLOR}55`
                    : `0 18px 45px ${player.color}33`;
                  const playerTagColor = isGain
                    ? GAIN_COLOR
                    : isLoss
                    ? LOSS_COLOR
                    : player.color;
                  return (
                    <article
                      key={player.id}
                      className={styles.playerCard}
                      style={{ borderColor, boxShadow }}
                    >
                      <header className={styles.playerCardHeader}>
                        <span
                          className={styles.swatch}
                          style={{ backgroundColor: playerTagColor }}
                          aria-hidden="true"
                        />
                        <div>
                          <p
                            className={styles.playerTag}
                            style={{ color: playerTagColor }}
                          >
                            Player {player.id}
                          </p>
                          <h3>{player.name}</h3>
                        </div>
                      </header>
                      <p className={styles.balanceValue}>
                        {formatCurrency(player.balance)}
                      </p>
                    </article>
                  );
                })}
                <article
                  className={styles.playerCard}
                  style={{
                    borderColor:
                      highlightTargetId === TAX_ID
                        ? GAIN_COLOR
                        : highlightSourceId === TAX_ID
                        ? LOSS_COLOR
                        : undefined,
                    boxShadow:
                      highlightTargetId === TAX_ID
                        ? `0 18px 45px ${GAIN_COLOR}55`
                        : highlightSourceId === TAX_ID
                        ? `0 18px 45px ${LOSS_COLOR}55`
                        : undefined,
                  }}
                >
                  <header>
                    <p className={styles.playerTag}>Special</p>
                    <h3>Tax Pile</h3>
                  </header>
                  <p className={styles.balanceValue}>
                    {formatCurrency(taxBalance)}
                  </p>
                </article>
                <article
                  className={styles.playerCard}
                  style={{
                    borderColor:
                      highlightTargetId === BANK_ID
                        ? GAIN_COLOR
                        : highlightSourceId === BANK_ID
                        ? LOSS_COLOR
                        : undefined,
                    boxShadow:
                      highlightTargetId === BANK_ID
                        ? `0 18px 45px ${GAIN_COLOR}55`
                        : highlightSourceId === BANK_ID
                        ? `0 18px 45px ${LOSS_COLOR}55`
                        : undefined,
                  }}
                >
                  <header>
                    <p className={styles.playerTag}>Special</p>
                    <h3>Bank</h3>
                  </header>
                  <p className={styles.balanceValue}>Unlimited</p>
                </article>
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.historyHeader}>
                <h2>Last 10 moves</h2>
                {history.length > 0 && (
                  <p className={styles.historyTimestamp}>
                    Updated {formatTimestamp(history[0].timestamp)}
                  </p>
                )}
              </div>
              {history.length === 0 ? (
                <p className={styles.historyEmpty}>No transfers yet.</p>
              ) : (
                <ul className={styles.historyList}>
                  {history.map((record, index) => (
                    <li key={record.id} className={styles.historyItem}>
                      <div>
                        <p className={styles.historyNames}>
                          <span className={styles.historySource}>
                            {record.sourceName}
                          </span>
                          <span
                            className={styles.historyArrow}
                            aria-hidden="true"
                          >
                            →
                          </span>
                          <span className={styles.historyTarget}>
                            {record.targetName}
                          </span>
                        </p>
                        <p className={styles.historyMeta}>
                          {formatTimestamp(record.timestamp)} ·
                          <span className={styles.historyAmount}>
                            {formatCurrency(record.amount)}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.revertButton}
                        onClick={() => handleRevertToHistory(record.id)}
                      >
                        Revert here
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
