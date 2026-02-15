"use client";

import { useEffect, useMemo, useState } from "react";
import { CHIP_SYMBOL, formatChips, shortenAddress } from "@/lib/utils";
import type { TableResponse } from "@/lib/types";
import { buildSeatMarket, formatOdds, toImpliedPercent } from "@/lib/betting";

const INDEXER_BASE = process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3002";
const BANKROLL_KEY = "railbird_bet_bankroll_v1";
const WAGERS_KEY = "railbird_wagers_v1";
const SETTLED_HANDS_KEY = "railbird_settled_hands_v1";
const DEFAULT_BANKROLL = 1000n * 10n ** 18n;

type WagerStatus = "open" | "won" | "lost";

interface Wager {
  id: string;
  tableId: string;
  handId: string;
  seatIndex: number;
  stakeWei: string;
  oddsBps: number;
  profileName: string;
  status: WagerStatus;
  payoutWei?: string;
  placedAt: string;
  settledAt?: string;
}

interface BettingPanelProps {
  initialTable: TableResponse;
}

function parseChipInputToWei(raw: string): bigint | null {
  const value = raw.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  const paddedFrac = `${frac}${"0".repeat(18)}`.slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(paddedFrac);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function BettingPanel({ initialTable }: BettingPanelProps) {
  const [table, setTable] = useState<TableResponse>(initialTable);
  const [bankrollWei, setBankrollWei] = useState<bigint>(DEFAULT_BANKROLL);
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [settledHands, setSettledHands] = useState<Set<string>>(new Set());
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [stakeInput, setStakeInput] = useState("50");
  const [notice, setNotice] = useState<string>("");

  const market = useMemo(() => buildSeatMarket(table), [table]);
  const handId = table.currentHand?.handId ?? null;
  const winnerSeat = table.currentHand?.winnerSeat ?? null;
  const marketOpen = handId !== null && winnerSeat === null;

  useEffect(() => {
    try {
      const rawBankroll = localStorage.getItem(BANKROLL_KEY);
      const rawWagers = localStorage.getItem(WAGERS_KEY);
      const rawSettled = localStorage.getItem(SETTLED_HANDS_KEY);

      if (rawBankroll) setBankrollWei(BigInt(rawBankroll));
      if (rawWagers) setWagers(JSON.parse(rawWagers) as Wager[]);
      if (rawSettled) setSettledHands(new Set(JSON.parse(rawSettled) as string[]));
    } catch {
      setNotice("저장된 베팅 데이터를 읽지 못해 기본값으로 시작합니다.");
    }
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${INDEXER_BASE}/api/tables/${table.tableId}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as TableResponse;
        setTable(next);
      } catch {
        // ignore transient fetch errors
      }
    }, 5000);

    return () => clearInterval(id);
  }, [table.tableId]);

  useEffect(() => {
    if (!handId || winnerSeat === null) return;
    const settleKey = `${table.tableId}:${handId}`;
    if (settledHands.has(settleKey)) return;

    let realized = 0n;
    const nextWagers: Wager[] = wagers.map((wager) => {
      if (wager.status !== "open") return wager;
      if (wager.tableId !== table.tableId || wager.handId !== handId) return wager;

      const won = wager.seatIndex === winnerSeat;
      if (!won) {
        return {
          ...wager,
          status: "lost" as const,
          payoutWei: "0",
          settledAt: nowIso(),
        };
      }

      const stake = BigInt(wager.stakeWei);
      const payout = (stake * BigInt(wager.oddsBps)) / 10_000n;
      realized += payout;
      return {
        ...wager,
        status: "won" as const,
        payoutWei: payout.toString(),
        settledAt: nowIso(),
      };
    });

    const nextBankroll = bankrollWei + realized;
    const nextSettled = new Set(settledHands);
    nextSettled.add(settleKey);

    setWagers(nextWagers);
    setBankrollWei(nextBankroll);
    setSettledHands(nextSettled);

    localStorage.setItem(WAGERS_KEY, JSON.stringify(nextWagers));
    localStorage.setItem(BANKROLL_KEY, nextBankroll.toString());
    localStorage.setItem(SETTLED_HANDS_KEY, JSON.stringify(Array.from(nextSettled)));

    setNotice(
      realized > 0n
        ? `핸드 #${handId} 정산 완료: +${formatChips(realized)} ${CHIP_SYMBOL}`
        : `핸드 #${handId} 정산 완료: 이번 라운드는 적중 베팅이 없습니다.`
    );
  }, [bankrollWei, handId, settledHands, table.tableId, wagers, winnerSeat]);

  const openWagers = wagers.filter((w) => w.status === "open").slice(-8).reverse();
  const settledWagers = wagers.filter((w) => w.status !== "open").slice(-8).reverse();

  const selectedMarket = market.find((m) => m.seatIndex === selectedSeat) ?? null;

  function persist(nextBankroll: bigint, nextWagers: Wager[]) {
    setBankrollWei(nextBankroll);
    setWagers(nextWagers);
    localStorage.setItem(BANKROLL_KEY, nextBankroll.toString());
    localStorage.setItem(WAGERS_KEY, JSON.stringify(nextWagers));
  }

  function placeBet() {
    setNotice("");
    if (!marketOpen || !handId) {
      setNotice("지금은 베팅이 닫혀 있습니다. 다음 핸드를 기다려주세요.");
      return;
    }
    if (!selectedMarket) {
      setNotice("먼저 베팅할 에이전트를 선택해주세요.");
      return;
    }

    const stakeWei = parseChipInputToWei(stakeInput);
    if (!stakeWei || stakeWei <= 0n) {
      setNotice("베팅 금액 형식이 올바르지 않습니다.");
      return;
    }
    if (stakeWei > bankrollWei) {
      setNotice("잔액이 부족합니다.");
      return;
    }

    const nextBankroll = bankrollWei - stakeWei;
    const wager: Wager = {
      id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      tableId: table.tableId,
      handId,
      seatIndex: selectedMarket.seatIndex,
      stakeWei: stakeWei.toString(),
      oddsBps: selectedMarket.oddsBps,
      profileName: selectedMarket.profile.codename,
      status: "open",
      placedAt: nowIso(),
    };

    const nextWagers = [...wagers, wager];
    persist(nextBankroll, nextWagers);
    setNotice(
      `베팅 접수: ${selectedMarket.profile.codename} / ${formatChips(stakeWei)} ${CHIP_SYMBOL} @ ${formatOdds(selectedMarket.oddsBps)}x`
    );
  }

  function resetBook() {
    const empty: Wager[] = [];
    const settled = new Set<string>();
    setNotice("베팅 기록을 초기화했습니다.");
    setWagers(empty);
    setSettledHands(settled);
    setBankrollWei(DEFAULT_BANKROLL);
    localStorage.setItem(BANKROLL_KEY, DEFAULT_BANKROLL.toString());
    localStorage.setItem(WAGERS_KEY, JSON.stringify(empty));
    localStorage.setItem(SETTLED_HANDS_KEY, JSON.stringify([]));
  }

  return (
    <section className="page-section">
      <div className="bet-header">
        <div>
          <h2 className="section-title">Rail Bets</h2>
          <p className="bet-subtitle">
            에이전트 프로필 기반 핸드 승자 베팅 보드입니다. 현재 핸드 승자 기준으로 자동 정산됩니다.
          </p>
        </div>
        <div className="card bet-bankroll">
          <div className="label">Virtual Bankroll</div>
          <div className="bet-bankroll-value">
            {formatChips(bankrollWei)} {CHIP_SYMBOL}
          </div>
          <button className="ghost-btn" onClick={resetBook} type="button">
            Reset
          </button>
        </div>
      </div>

      <div className={`bet-market-state ${marketOpen ? "open" : "closed"}`}>
        {marketOpen ? `Hand #${handId} market open` : "Market closed (waiting for next hand)"}
      </div>

      {notice && <div className="bet-notice">{notice}</div>}

      <div className="bet-layout">
        <div className="bet-agent-grid">
          {market.map((entry) => (
            <article
              key={entry.seatIndex}
              className={`card bet-agent-card ${selectedSeat === entry.seatIndex ? "selected" : ""}`}
            >
              <div className="bet-agent-top">
                <div>
                  <div className="bet-agent-seat">Seat {entry.seatIndex}</div>
                  <h3 className="bet-agent-name">{entry.profile.codename}</h3>
                  <div className="bet-agent-style">{entry.profile.style}</div>
                </div>
                <div className="bet-agent-odds">{formatOdds(entry.oddsBps)}x</div>
              </div>

              <p className="bet-agent-blurb">{entry.profile.blurb}</p>

              <div className="bet-agent-stats">
                <span>Implied: {toImpliedPercent(entry.winProb)}</span>
                <span>Aggro: {(entry.profile.aggression * 100).toFixed(0)}%</span>
                <span>Stack: {formatChips(entry.stack)} {CHIP_SYMBOL}</span>
              </div>

              <div className="bet-agent-owner">{shortenAddress(entry.ownerAddress)}</div>

              <button
                type="button"
                className="bet-select-btn"
                onClick={() => setSelectedSeat(entry.seatIndex)}
              >
                {selectedSeat === entry.seatIndex ? "Selected" : "Bet on this agent"}
              </button>
            </article>
          ))}
        </div>

        <aside className="card bet-slip">
          <h3 className="section-title-sm">Bet Slip</h3>
          <div className="bet-slip-row">
            <span className="label">Table / Hand</span>
            <span>
              #{table.tableId} / {handId ?? "-"}
            </span>
          </div>
          <div className="bet-slip-row">
            <span className="label">Selection</span>
            <span>{selectedMarket ? selectedMarket.profile.codename : "None"}</span>
          </div>
          <div className="bet-slip-row">
            <span className="label">Odds</span>
            <span>{selectedMarket ? `${formatOdds(selectedMarket.oddsBps)}x` : "-"}</span>
          </div>

          <label className="bet-input-label" htmlFor="stake-input">Stake ({CHIP_SYMBOL})</label>
          <input
            id="stake-input"
            className="bet-input"
            value={stakeInput}
            onChange={(e) => setStakeInput(e.target.value)}
            placeholder="e.g. 50"
            inputMode="decimal"
          />

          <div className="bet-quick-row">
            {["10", "25", "50", "100"].map((preset) => (
              <button
                key={preset}
                type="button"
                className="ghost-btn"
                onClick={() => setStakeInput(preset)}
              >
                {preset}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="bet-place-btn"
            onClick={placeBet}
            disabled={!marketOpen}
          >
            Place Bet
          </button>
        </aside>
      </div>

      <div className="bet-history-grid">
        <div className="card">
          <h3 className="section-title-sm">Open Bets</h3>
          {openWagers.length === 0 ? (
            <div className="muted">No open bets.</div>
          ) : (
            <div className="bet-ticket-list">
              {openWagers.map((wager) => (
                <div key={wager.id} className="bet-ticket">
                  <div>{wager.profileName}</div>
                  <div>
                    Hand #{wager.handId} · {formatChips(BigInt(wager.stakeWei))} {CHIP_SYMBOL}
                  </div>
                  <div>@ {formatOdds(wager.oddsBps)}x</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="section-title-sm">Recent Settlements</h3>
          {settledWagers.length === 0 ? (
            <div className="muted">No settled bets yet.</div>
          ) : (
            <div className="bet-ticket-list">
              {settledWagers.map((wager) => (
                <div key={wager.id} className={`bet-ticket ${wager.status}`}>
                  <div>
                    Hand #{wager.handId} · Seat {wager.seatIndex}
                  </div>
                  <div>{wager.profileName}</div>
                  <div>
                    {wager.status === "won"
                      ? `WIN +${formatChips(BigInt(wager.payoutWei || "0"))} ${CHIP_SYMBOL}`
                      : "LOSE"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
