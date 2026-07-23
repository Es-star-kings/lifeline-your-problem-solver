import type { LifelineAnalysis } from "../types";
import { gemmaProvider } from "./gemma-provider";
import { offlineProvider } from "./offline-provider";
import {
  AIProviderError,
  type LifelineAIContext,
  type LifelineAIProvider,
} from "./provider";

/**
 * Automatic provider selection with graceful fallback.
 *
 * - If Gemma is configured (VITE_GEMMA_ENDPOINT set), try it first.
 * - On any failure — network error, timeout, malformed output — fall back
 *   to the offline provider so the user still gets a useful answer.
 * - The offline provider always works.
 */
function providerChain(): LifelineAIProvider[] {
  const chain: LifelineAIProvider[] = [];
  if (gemmaProvider.isAvailable?.()) chain.push(gemmaProvider);
  chain.push(offlineProvider);
  return chain;
}

const adaptiveProvider: LifelineAIProvider = {
  name: "LIFELINE",

  isAvailable() {
    return true;
  },

  async analyzeProblem(
    ctx: LifelineAIContext,
    signal?: AbortSignal,
  ): Promise<LifelineAnalysis> {
    const chain = providerChain();
    let lastError: unknown;
    for (const provider of chain) {
      try {
        return await provider.analyzeProblem(ctx, signal);
      } catch (err) {
        // Never swallow user-triggered cancellation.
        if ((err as { name?: string })?.name === "AbortError") throw err;
        lastError = err;
        if (typeof console !== "undefined") {
          console.warn(`[LIFELINE] ${provider.name} failed, trying next.`, err);
        }
        continue;
      }
    }
    throw new AIProviderError(
      "No LIFELINE provider could handle this request.",
      lastError,
    );
  },
};

export function selectProvider(): LifelineAIProvider {
  return adaptiveProvider;
}

export function isGemmaConfigured(): boolean {
  return gemmaProvider.isAvailable?.() === true;
}