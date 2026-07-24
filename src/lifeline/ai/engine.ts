import type { LifelineAnalysis, LifelineSituation } from "../types";
import type { LifelineAIProvider } from "./provider";
import { selectProvider } from "./provider-selection";

/**
 * LIFELINE AI Engine. Sits between the UI and the underlying AI provider.
 * Future responsibilities: prompt construction, response validation,
 * caching, offline fallbacks, and local case persistence.
 */
export class LifelineEngine {
  constructor(private provider: LifelineAIProvider = selectProvider()) {}

  setProvider(provider: LifelineAIProvider) {
    this.provider = provider;
  }

  getProviderName(): string {
    return this.provider.name;
  }

  async analyze(input: string, signal?: AbortSignal): Promise<LifelineAnalysis> {
    const trimmed = input.trim();

    if (!trimmed) {
      throw new Error("Please describe a problem first.");
    }

    return this.provider.analyzeProblem(
      {
        input: trimmed,
      },
      signal,
    );
  }

  async continueSituation(
    situation: LifelineSituation,
    observation: string,
    signal?: AbortSignal,
  ): Promise<LifelineAnalysis> {
    const trimmed = observation.trim();

    if (!trimmed) {
      throw new Error("Please describe what you observed.");
    }

    return this.provider.analyzeProblem(
      {
        input: situation.input,
        situation,
        newObservation: trimmed,
      },
      signal,
    );
  }
}

export const lifelineEngine = new LifelineEngine();
