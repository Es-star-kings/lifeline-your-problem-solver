import type {
  LifelineAnalysis,
  LifelineSituation,
  SituationObservation,
  SituationStatus,
} from "../types";

const KEY = "lifeline.situations.v1";

type Listener = () => void;
const listeners = new Set<Listener>();

let cachedSnapshot: LifelineSituation[] | null = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function read(): LifelineSituation[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LifelineSituation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: LifelineSituation[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(list));
  cachedSnapshot = null;
  listeners.forEach((l) => l());
}

function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function deriveTitle(input: string) {
  const clean = input.trim().replace(/\s+/g, " ");
  if (clean.length <= 64) return clean;
  return clean.slice(0, 60).trimEnd() + "…";
}

export const situationsStore = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  list(): LifelineSituation[] {
    if (cachedSnapshot) return cachedSnapshot;
    cachedSnapshot = read().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return cachedSnapshot;
  },
  get(id: string): LifelineSituation | undefined {
    return read().find((s) => s.id === id);
  },
  create(input: string, analysis: LifelineAnalysis): LifelineSituation {
    const now = new Date().toISOString();
    const situation: LifelineSituation = {
      id: uid(),
      title: deriveTitle(input),
      input,
      analysis,
      observations: [],
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    write([situation, ...read()]);
    return situation;
  },
  addObservation(
    id: string,
    content: string,
    source: SituationObservation["source"] = "user",
  ): LifelineSituation | undefined {
    const list = read();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    const now = new Date().toISOString();
    const obs: SituationObservation = {
      id: uid(),
      content: content.trim(),
      createdAt: now,
      source,
    };
    const updated: LifelineSituation = {
      ...list[idx],
      observations: [...list[idx].observations, obs],
      updatedAt: now,
    };
    list[idx] = updated;
    write(list);
    return updated;
  },
  setStatus(id: string, status: SituationStatus) {
    const list = read();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], status, updatedAt: new Date().toISOString() };
    write(list);
  },
  updateAnalysis(id: string, analysis: LifelineAnalysis) {
    const list = read();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], analysis, updatedAt: new Date().toISOString() };
    write(list);
  },
  remove(id: string) {
    write(read().filter((s) => s.id !== id));
  },
};

export function useSituationsSnapshot() {
  // Simple external-store hook without importing React here to keep this
  // module framework-light. Consumers wire useSyncExternalStore directly.
  return situationsStore.list();
}