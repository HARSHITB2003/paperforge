import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'paperforge.v1';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { deployed: [] };
    const parsed = JSON.parse(raw);
    return { deployed: parsed.deployed ?? [] };
  } catch {
    return { deployed: [] };
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ deployed: state.deployed }));
  } catch {}
}

let state = {
  raw_input: '',
  parsed: null,
  parse_stream: [],
  parse_status: 'idle',
  backtest: null,
  backtest_status: 'idle',
  backtest_progress: 0,
  verdict: null,
  verdict_status: 'idle',
  counterfactuals: [],
  counterfactual_status: 'idle',
  deployed: loadPersisted().deployed,
  active_strategy_id: null,
  stage: 'compose',
};

const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

export const store = {
  get() {
    return state;
  },
  set(patch) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    persist(state);
    emit();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset() {
    state = {
      ...state,
      raw_input: '',
      parsed: null,
      parse_stream: [],
      parse_status: 'idle',
      backtest: null,
      backtest_status: 'idle',
      backtest_progress: 0,
      verdict: null,
      verdict_status: 'idle',
      counterfactuals: [],
      counterfactual_status: 'idle',
      active_strategy_id: null,
      stage: 'compose',
    };
    emit();
  },
};

export function useStore(selector = (s) => s) {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(state),
    () => selector(state)
  );
}
