import type { LifelineAnalysis } from "../types";
import { placeholderProvider, type LifelineAIProvider } from "./provider";

/**
 * LIFELINE AI Engine. Sits between the UI and the underlying AI provider.
 * Future responsibilities: prompt construction, response validation,
 * caching, offline fallbacks, and local case persistence.
 */
export class LifelineEngine {
  constructor(private provider: LifelineAIProvider = placeholderProvider) {}

  setProvider(provider: LifelineAIProvider) {
    this.provider = provider;
  }

  async analyze(input: string, signal?: AbortSignal): Promise<LifelineAnalysis> {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("Please describe a problem first.");
    return this.provider.analyzeProblem(trimmed, signal);
  }
}

export const lifelineEngine = new LifelineEngine();