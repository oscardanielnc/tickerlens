"use client";

import { useSyncExternalStore } from "react";

import type { AnalysisPayload } from "@/lib/api";

/** Compact point-in-time snapshot of an analysis, kept in the visitor's localStorage. */
export interface SavedTicker {
  ticker: string;
  name: string;
  savedAt: string; // ISO timestamp
  price: number;
  trend: "uptrend" | "downtrend" | "sideways";
  rsi14: number;
  ttPassed: number;
  ttChecked: number;
  peTtm: number | null;
  revenueGrowthYoyPct: number | null;
  suggestedEntry: number | null;
}

const KEY = "tickerlens.saved";
const EVENT = "tickerlens:saved-changed";
const EMPTY: SavedTicker[] = [];

let cache: SavedTicker[] = EMPTY;
let cacheRaw: string | null = null;

function read(): SavedTicker[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    cache = raw ? (JSON.parse(raw) as SavedTicker[]) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(list: SavedTicker[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function snapshotFrom(data: AnalysisPayload): SavedTicker {
  return {
    ticker: data.ticker,
    name: data.profile.name,
    savedAt: new Date().toISOString(),
    price: data.quote.price,
    trend: data.technical.trend,
    rsi14: data.technical.rsi14,
    ttPassed: data.technical.trend_template.passed,
    ttChecked: data.technical.trend_template.checked,
    peTtm: data.valuation?.pe_ttm ?? null,
    revenueGrowthYoyPct: data.valuation?.revenue_growth_yoy_pct ?? null,
    suggestedEntry: data.levels.suggested_entry,
  };
}

export function saveTicker(entry: SavedTicker): void {
  write([entry, ...read().filter((s) => s.ticker !== entry.ticker)]);
}

export function removeTicker(ticker: string): void {
  write(read().filter((s) => s.ticker !== ticker));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback); // other tabs
  window.addEventListener(EVENT, callback); // this tab
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

export function useSavedTickers(): SavedTicker[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
