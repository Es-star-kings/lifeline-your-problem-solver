import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { lifelineEngine } from "@/lifeline/ai/engine";
import { examples } from "@/lifeline/examples";
import { situationsStore } from "@/lifeline/storage/situations";
import type { LifelineAnalysis, LifelineSituation } from "@/lifeline/types";

const MAX_CHARS = 2000;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LIFELINE — Local intelligence for real life" },
      {
        name: "description",
        content:
          "Describe any real-world situation. LIFELINE helps you understand it and find practical next steps, powered by Gemma.",
      },
      { property: "og:title", content: "LIFELINE — Local intelligence for real life" },
      {
        property: "og:description",
        content:
          "An adaptive AI workspace. Bring a situation, LIFELINE helps you move forward.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type AnalysisPhase = 0 | 1 | 2 | 3;

function Index() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 900);
    return () => clearTimeout(t);
  }, []);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<AnalysisPhase>(0);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const navigate = useNavigate();

  const situations = useSyncExternalStore(
    (cb) => situationsStore.subscribe(cb),
    () => situationsStore.list(),
    () => [] as LifelineSituation[],
  );

  const disabled = input.trim().length === 0 || loading;

  async function onAnalyze() {
    setError(null);
    setLoading(true);
    setPhase(1);
    const t1 = setTimeout(() => setPhase(2), 500);
    const t2 = setTimeout(() => setPhase(3), 1000);
    try {
      const result = await lifelineEngine.analyze(input);
      const situation = situationsStore.create(input, result);
      navigate({ to: "/situation/$id", params: { id: situation.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setLoading(false);
      setPhase(0);
    }
  }

  function pickExample(prompt: string) {
    setInput(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  if (booting) return <BootScreen />;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <Atmosphere />
      <Header />
      <main className="relative mx-auto max-w-3xl px-6 pb-28 pt-16 sm:pt-20">
        <div className="animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            POWERED BY GEMMA
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            What problem are you facing today?
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Describe a problem in your own words. LIFELINE helps you understand what is
            happening and find practical next steps.
          </p>
        </div>

        <section
          className="group relative mt-10 overflow-hidden rounded-2xl border border-border bg-card/70 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_20px_60px_-30px_rgba(0,0,0,0.6)] backdrop-blur transition focus-within:border-primary/50"
          aria-label="Problem input"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-60" />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            placeholder="Tell me what is happening…"
            rows={6}
            className="block w-full resize-none bg-transparent px-5 py-5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none sm:px-6"
          />
          <div className="flex items-center justify-between gap-4 border-t border-border/80 bg-background/30 px-5 py-3 sm:px-6">
            <span className="text-xs tabular-nums text-muted-foreground">
              {input.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={disabled}
              className="group/btn relative inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_10px_30px_-12px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100"
            >
              {loading ? (
                <>
                  <Spinner /> Analyzing…
                </>
              ) : (
                <>
                  Analyze with Gemma
                  <ArrowRight />
                </>
              )}
            </button>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              See how LIFELINE adapts
            </h2>
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {examples.map((ex, i) => (
              <button
                key={ex.prompt}
                type="button"
                onClick={() => pickExample(ex.prompt)}
                style={{ animationDelay: `${80 * i}ms` }}
                className="group animate-fade-in rounded-xl border border-border bg-card/60 p-4 text-left backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card"
              >
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-primary/70" />
                  {ex.label}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-foreground/90">
                  “{ex.prompt}”
                </div>
                <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground/80 opacity-0 transition group-hover:opacity-100">
                  Try it <ArrowRight small />
                </div>
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="mt-10 animate-fade-in rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        {loading && <AnalysisProgress phase={phase} />}

        {situations.length > 0 && !loading && (
          <section className="mt-12">
            <div className="flex items-center gap-3">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ongoing situations
              </h2>
              <div className="h-px flex-1 bg-border/70" />
            </div>
            <ul className="mt-4 space-y-2">
              {situations.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link
                    to="/situation/$id"
                    params={{ id: s.id }}
                    className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card/60 px-4 py-3 backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        <span className="text-primary">{s.analysis.domain}</span>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span>{s.status}</span>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span>{s.observations.length} observation{s.observations.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="mt-1 truncate text-sm text-foreground/90">{s.title}</div>
                    </div>
                    <div className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                      {new Date(s.updatedAt).toLocaleDateString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="relative border-t border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4 text-[11px] text-muted-foreground">
          <span>Offline-first · On-device intelligence</span>
          <span className="tabular-nums">v0.1 · prototype</span>
        </div>
      </footer>
    </div>
  );
}

function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-[0.18] blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 55%, transparent), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
    </div>
  );
}

function Header() {
  return (
    <header className="relative z-10 border-b border-border/70 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <LifelineMark />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold tracking-[0.22em] text-foreground">
              LIFELINE
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              Local intelligence for real life.
            </div>
          </div>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          READY
        </div>
      </div>
    </header>
  );
}

function LifelineMark() {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-card/80 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset]">
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
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

function BootScreen() {
  return (
    <div className="dark fixed inset-0 z-50 grid place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-5 text-center animate-fade-in">
        <div className="grid h-12 w-12 place-items-center rounded-lg border border-border bg-card/80">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M1 8h3l1.5-4 2 8L10 6l1.5 2H15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary animate-pulse"
            />
          </svg>
        </div>
        <div>
          <div className="text-sm font-semibold tracking-[0.28em]">LIFELINE</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Local intelligence for real life.
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Spinner /> Preparing your workspace…
        </div>
      </div>
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

function ArrowRight({ small = false }: { small?: boolean }) {
  const s = small ? 12 : 14;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AnalysisProgress({ phase }: { phase: AnalysisPhase }) {
  const steps = [
    "Reading what you described",
    "Understanding what you need",
    "Figuring out the best way to help",
  ];
  return (
    <section className="mt-10 animate-fade-in rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Spinner /> Understanding your situation
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((label, i) => {
          const idx = (i + 1) as AnalysisPhase;
          const state = phase > idx ? "done" : phase === idx ? "active" : "pending";
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <ProgressGlyph state={state} />
              <span
                className={
                  state === "done"
                    ? "text-foreground"
                    : state === "active"
                      ? "text-foreground"
                      : "text-muted-foreground/70"
                }
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ProgressGlyph({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full border border-primary/60 bg-primary/15 text-primary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative grid h-5 w-5 place-items-center rounded-full border border-primary/60">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      </span>
    );
  }
  return (
    <span className="h-5 w-5 rounded-full border border-border" />
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
    <section className="mt-10 space-y-6 animate-fade-in">
      <div className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
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

      {analysis.actionPlan.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
          <h3 className="text-lg font-semibold text-foreground">Action plan</h3>
          <ol className="mt-4 space-y-4">
            {analysis.actionPlan.map((s) => (
              <li key={s.step} className="flex gap-4">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-background text-xs font-semibold text-primary">
                  {s.step}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{s.title}</div>
                  <div className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {s.description}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {analysis.followUpQuestions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
          <h3 className="text-lg font-semibold text-foreground">Follow-up questions</h3>
          <ul className="mt-3 space-y-2">
            {analysis.followUpQuestions.map((q) => (
              <li
                key={q}
                className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground/90"
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