/**
 * Provider-agnostic AI client for LIFELINE.
 *
 * Talks to a remote Gemma-compatible inference API. The base URL comes
 * from VITE_GEMMA_API_URL — never hardcoded, never bundled with a key.
 * Any secret credentials must live on the server behind that URL.
 *
 * Request:  POST ${VITE_GEMMA_API_URL}/generate
 *           { prompt, system_prompt, temperature, max_new_tokens }
 * Response: { response: string }
 */

export interface GenerateOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** Request timeout in ms. Defaults to 30_000. */
  timeoutMs?: number;
  /** Abort signal from the caller (merged with the internal timeout). */
  signal?: AbortSignal;
}

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly retriable = false,
  ) {
    super(message);
    this.name = "AIServiceError";
  }
}

export type GemmaRuntimeStatus = "online" | "unavailable" | "offline";

export interface GemmaRuntimeInfo {
  configured: boolean;
  status: GemmaRuntimeStatus;
  message: string;
}

export const AI_UNAVAILABLE_MESSAGE = "AI service is temporarily unavailable. Please try again.";

function getBaseUrl(): string {
  const raw = (import.meta.env.VITE_GEMMA_API_URL as string | undefined)?.trim();
  if (!raw) {
    throw new AIServiceError("VITE_GEMMA_API_URL is not configured");
  }
  return raw.replace(/\/+$/, "");
}

export function isAIConfigured(): boolean {
  const raw = (import.meta.env.VITE_GEMMA_API_URL as string | undefined)?.trim();
  return !!raw && raw.length > 0;
}

export async function getGemmaRuntimeInfo(signal?: AbortSignal): Promise<GemmaRuntimeInfo> {
  if (!isAIConfigured()) {
    return {
      configured: false,
      status: "offline",
      message: "Offline AI Mode",
    };
  }

  if (!import.meta.env.DEV || typeof window === "undefined") {
    return {
      configured: true,
      status: "online",
      message: "Gemma AI Online",
    };
  }

  try {
    const response = await fetch(`${getBaseUrl()}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });

    if (response.ok) {
      return {
        configured: true,
        status: "online",
        message: "Gemma AI Online",
      };
    }

    return {
      configured: true,
      status: "unavailable",
      message: "Gemma AI Unavailable",
    };
  } catch {
    return {
      configured: true,
      status: "unavailable",
      message: "Gemma AI Unavailable",
    };
  }
}

function mergeSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Timeout", "TimeoutError"));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort((external as AbortSignal).reason);
  };
  if (external) {
    if (external.aborted) onExternalAbort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timeout);
      if (external) external.removeEventListener("abort", onExternalAbort);
    },
  };
}

async function callOnce(url: string, body: string, signal: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "AbortError" || name === "TimeoutError") {
      throw new AIServiceError("AI request was aborted or timed out", err, true);
    }
    // Network-level failure — retriable.
    throw new AIServiceError("Could not reach AI service", err, true);
  }

  if (!res.ok) {
    // 5xx and 429 are retriable; 4xx generally are not.
    const retriable = res.status >= 500 || res.status === 429;
    throw new AIServiceError(`AI service returned ${res.status}`, undefined, retriable);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    throw new AIServiceError("AI service returned invalid JSON", err);
  }

  const text = (payload as { response?: unknown } | null)?.response;
  if (typeof text !== "string" || text.length === 0) {
    throw new AIServiceError("AI service returned an empty response");
  }
  return text;
}

/**
 * Send a prompt to the configured AI inference API and return the raw text.
 * Retries once on a transient network / 5xx / 429 failure. Throws
 * AIServiceError on unrecoverable failure — callers should surface
 * AI_UNAVAILABLE_MESSAGE in that case.
 */
export async function generateAIResponse(
  prompt: string,
  options: GenerateOptions = {},
): Promise<string> {
  if (!prompt || !prompt.trim()) {
    throw new AIServiceError("Prompt is empty");
  }

  const url = `${getBaseUrl()}/generate`;
  const body = JSON.stringify({
    prompt,
    system_prompt: options.systemPrompt ?? "",
    temperature: options.temperature ?? 0.7,
    max_new_tokens: options.maxTokens ?? 512,
  });

  const timeoutMs = options.timeoutMs ?? 30_000;

  const attempt = async (): Promise<string> => {
    const { signal, cancel } = mergeSignals(options.signal, timeoutMs);
    try {
      return await callOnce(url, body, signal);
    } finally {
      cancel();
    }
  };

  try {
    return await attempt();
  } catch (err) {
    // User-initiated cancellation should not be retried or masked.
    if (options.signal?.aborted) throw err;
    if (err instanceof AIServiceError && err.retriable) {
      return await attempt();
    }
    throw err;
  }
}
