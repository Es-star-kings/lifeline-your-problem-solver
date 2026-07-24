/**
 * AI provider abstraction. Concrete implementations (Gemma via a
 * server-side proxy, an on-device runtime, or the offline fallback)
 * plug in behind this interface. UI code never talks to a provider
 * directly — it goes through LifelineEngine.
 */
import type { LifelineAnalysis, LifelineSituation } from "../types";

export type LifelineInputKind = "text" | "voice" | "image";

export interface LifelineAIContext {
  input: string;
  /** Reserved for future multi-modal input; currently always "text". */
  inputKind?: LifelineInputKind;
  situation?: LifelineSituation;
  newObservation?: string;
}

export interface LifelineAIProvider {
  name: string;
  /** Whether this provider can currently service a request. */
  isAvailable?(): boolean | Promise<boolean>;

  analyzeProblem(context: LifelineAIContext, signal?: AbortSignal): Promise<LifelineAnalysis>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
