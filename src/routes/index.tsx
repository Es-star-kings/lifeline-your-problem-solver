import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lifelineEngine } from "@/lifeline/ai/engine";
import { examples } from "@/lifeline/examples";
import type { LifelineAnalysis } from "@/lifeline/types";

const MAX_CHARS = 2000;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LIFELINE — Local intelligence for real life" },
      {
        name: "description",
        content:
          "LIFELINE turns real-world problems into practical next steps, powered by Gemma.",
      },
      { property: "og:title", content: "LIFELINE — Local intelligence for real life" },
      {
        property: "og:description",
        content:
          "Describe a problem in your own words. LIFELINE helps you understand it and turn it into practical next steps.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<LifelineAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = input.trim().length === 0 || loading;

  async function onAnalyze() {
    setError(null);
    setAnalysis(null);
    setLoading(true);
    try {
      const result = await lifelineEngine.analyze(input);
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-14">
        <div className="mb-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            POWERED BY GEMMA
          </span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          What problem are you facing today?
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Describe a problem in your own words. LIFELINE will help you understand it and
          turn it into practical next steps.
        </p>

        <section className="mt-8 rounded-2xl border border-border bg-card shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            placeholder="For example: My maize leaves are turning yellow..."
            rows={6}
            className="block w-full resize-none rounded-t-2xl bg-transparent px-5 py-4 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {input.length} / {MAX_CHARS}
            </span>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Spinner /> Analyzing…
                </>
              ) : (
                <>Analyze with Gemma</>
              )}
            </button>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Try an example
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {examples.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setInput(ex.prompt)}
                className="group rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="text-[10px] font-semibold tracking-[0.16em] text-primary">
                  {ex.label}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-foreground/90">
                  "{ex.prompt}"
                </div>
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="mt-8 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        {analysis && <AnalysisView analysis={analysis} />}
        {loading && !analysis && <LoadingSkeleton />}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <LifelineMark />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-[0.16em] text-foreground">
              LIFELINE
            </div>
            <div className="text-[11px] text-muted-foreground">
              Local intelligence for real life.
            </div>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Ready
        </div>
      </div>
    </header>
  );
}

function LifelineMark() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M1 8h3l1.5-4 2 8L10 6l1.5 2H15"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        />
      </svg>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mt-8 space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-muted"
          style={{ width: `${90 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: LifelineAnalysis }) {
  const urgencyColor =
    analysis.urgency === "high"
      ? "text-destructive"
      : analysis.urgency === "medium"
        ? "text-primary"
        : "text-muted-foreground";

  return (
    <section className="mt-10 space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
          <span className="rounded-full border border-border px-2 py-0.5 text-primary">
            {analysis.domain}
          </span>
          <span className={`rounded-full border border-border px-2 py-0.5 ${urgencyColor}`}>
            {analysis.urgency} urgency
          </span>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">Understanding</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {analysis.problemSummary}
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-foreground/90">
          {analysis.explanation}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground">Action plan</h3>
        <ol className="mt-4 space-y-4">
          {analysis.actionPlan.map((s) => (
            <li key={s.step} className="flex gap-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-xs font-semibold text-primary">
                {s.step}
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">{s.title}</div>
                <div className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {s.description}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {analysis.followUpQuestions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground">Follow-up questions</h3>
          <ul className="mt-3 space-y-2">
            {analysis.followUpQuestions.map((q) => (
              <li
                key={q}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground/90"
              >
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.safetyNote && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {analysis.safetyNote}
        </div>
      )}
    </section>
  );
}
