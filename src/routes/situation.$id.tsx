import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { situationsStore } from "@/lifeline/storage/situations";
import { lifelineEngine } from "@/lifeline/ai/engine";
import type { LifelineActionStep, LifelineSituation, SituationStatus } from "@/lifeline/types";

export const Route = createFileRoute("/situation/$id")({
  head: () => ({
    meta: [
      { title: "Situation — LIFELINE" },
      {
        name: "description",
        content:
          "Work through a real-world situation with LIFELINE. Track observations, next steps, and progress over time.",
      },
      { property: "og:title", content: "Situation — LIFELINE" },
      {
        property: "og:description",
        content: "Adaptive AI workspace for working through real situations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SituationPage,
});

const STATUSES: { value: SituationStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
];

function SituationPage() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const { id } = Route.useParams();
  const navigate = useNavigate();

  const situations = useSyncExternalStore(
    (cb) => situationsStore.subscribe(cb),
    () => situationsStore.list(),
    () => [] as LifelineSituation[],
  );
  const situation = useMemo(() => situations.find((s) => s.id === id), [situations, id]);

  const [observation, setObservation] = useState("");
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  if (!situation) {
    return (
      <div className="relative min-h-screen bg-background text-foreground">
        <Atmosphere />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Situation
          </div>
          <h1 className="mt-3 text-2xl font-semibold">This situation is no longer here.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been deleted, or the link is out of date.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-card/70 px-4 py-2 text-sm text-foreground/90 backdrop-blur transition hover:border-primary/40"
          >
            ← Back to LIFELINE
          </Link>
        </main>
      </div>
    );
  }

  const { analysis } = situation;
  const situationId = situation.id;
  const [stepState, setStepState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    analysis.actionPlan.forEach((step) => {
      initial[step.id] = step.status === "completed";
    });
    return initial;
  });

  async function addObservation() {
    const content = observation.trim();

    if (!content || isReanalyzing) return;

    setIsReanalyzing(true);

    try {
      const updatedSituation = situationsStore.addObservation(situationId, content, "user");

      if (!updatedSituation) {
        throw new Error("Could not save observation.");
      }

      const updatedAnalysis = await lifelineEngine.continueSituation(updatedSituation, content);

      situationsStore.updateAnalysis(updatedSituation.id, updatedAnalysis);

      setObservation("");
    } catch (error) {
      console.error(error);
    } finally {
      setIsReanalyzing(false);
    }
  }

  function onDelete() {
    if (typeof window !== "undefined") {
      const ok = window.confirm("Delete this situation? This cannot be undone.");
      if (!ok) return;
    }
    situationsStore.remove(situation!.id);
    navigate({ to: "/" });
  }

  const urgencyColor =
    analysis.urgency === "high"
      ? "text-destructive"
      : analysis.urgency === "medium"
        ? "text-primary"
        : "text-muted-foreground";

  const completedSteps = analysis.actionPlan.filter((step) => stepState[step.id]).length;
  const progressPercent = Math.round((completedSteps / Math.max(analysis.actionPlan.length, 1)) * 100);

  function toggleStep(step: LifelineActionStep) {
    const nextValue = !stepState[step.id];
    setStepState((current) => ({ ...current, [step.id]: nextValue }));
    const enhanced = analysis.actionPlan.map((item) =>
      item.id === step.id ? { ...item, status: nextValue ? "completed" : "pending" } : item,
    );
    situationsStore.updateAnalysis(situationId, { ...analysis, actionPlan: enhanced });
  }

  const timeline = [
    {
      key: "origin",
      kind: "origin" as const,
      when: situation.createdAt,
      title: "Situation described",
      body: situation.input,
    },
    ...situation.observations.map((o) => ({
      key: o.id,
      kind: o.source,
      when: o.createdAt,
      title: o.source === "user" ? "You observed" : "LIFELINE updated",
      body: o.content,
    })),
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <Atmosphere />

      <header className="relative z-10 border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground transition hover:text-foreground"
          >
            ← LIFELINE
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Situation workspace
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-6 pb-28 pt-10 sm:pt-14">
        {/* Header card */}
        <section className="animate-fade-in rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
            <span className="rounded-full border border-border px-2 py-0.5 text-primary">
              {analysis.domain}
            </span>
            <span className={`rounded-full border border-border px-2 py-0.5 ${urgencyColor}`}>
              {analysis.urgency} urgency
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
              {new Date(situation.createdAt).toLocaleString()}
            </span>
          </div>
          <h1 className="mt-4 text-balance text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {situation.title}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-background/40 p-1">
              {STATUSES.map((s) => {
                const active = situation.status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => situationsStore.setStatus(situation.id, s.value)}
                    className={
                      "rounded-md px-3 py-1.5 text-xs font-medium transition " +
                      (active
                        ? "bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset]"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:border-destructive/60"
            >
              Delete
            </button>
          </div>
        </section>

        {analysis.safetyNote && (
          <div className="mt-6 animate-fade-in rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">
              Safety notice
            </div>
            <p className="mt-1">{analysis.safetyNote}</p>
          </div>
        )}

        <SectionCard eyebrow="Section 01" title="Problem understanding">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {analysis.category}
            </span>
            <span className={`rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${urgencyColor}`}>
              {analysis.urgency} urgency
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{analysis.problemSummary}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">{analysis.explanation}</p>
          <div className="mt-4 rounded-xl border border-border/70 bg-background/40 p-4 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              User intent
            </div>
            <p className="mt-1 text-foreground/90">{analysis.userIntent}</p>
          </div>
          <details className="mt-5 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Original description
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-foreground/85">{situation.input}</p>
          </details>
        </SectionCard>

        {analysis.actionPlan.length > 0 && (
          <SectionCard eyebrow="Section 02" title="Action plan">
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Progress
                </div>
                <div className="mt-1 text-foreground/90">
                  {completedSteps} of {analysis.actionPlan.length} steps complete
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Completion
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">{progressPercent}%</div>
              </div>
            </div>
            <ol className="space-y-3">
              {analysis.actionPlan.map((step) => (
                <li key={step.id} className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Step {step.step}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{step.title}</div>
                      <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</div>
                      {step.timeframe && (
                        <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-primary">
                          {step.timeframe}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleStep(step)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        stepState[step.id]
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {stepState[step.id] ? "Done" : "Mark done"}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>
        )}

        {analysis.suggestedTools.length > 0 && (
          <SectionCard eyebrow="Section 03" title="Learn & explore">
            <div className="grid gap-3 md:grid-cols-2">
              {analysis.suggestedTools.map((tool) => (
                <div key={tool.id} className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                    {tool.type}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{tool.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        <SectionCard eyebrow="Section 04" title="Resources">
          {analysis.resources.length > 0 ? (
            <div className="space-y-3">
              {analysis.resources.map((resource) => (
                <div key={resource.id} className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {resource.kind}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{resource.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {resource.description}
                  </p>
                  {resource.locationHint && (
                    <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-primary">
                      {resource.locationHint}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6 text-sm text-muted-foreground">
              Resources and nearby support will appear here as the workspace grows.
            </div>
          )}
        </SectionCard>

        <SectionCard eyebrow="Section 05" title="Situation timeline">
          <ol className="relative space-y-5 pl-6">
            <span
              aria-hidden
              className="absolute left-[9px] top-1 bottom-1 w-px bg-gradient-to-b from-primary/40 via-border to-transparent"
            />
            {timeline.map((t) => (
              <li key={t.key} className="relative">
                <span
                  aria-hidden
                  className={
                    "absolute -left-6 top-1.5 grid h-4 w-4 place-items-center rounded-full border " +
                    (t.kind === "origin"
                      ? "border-primary/60 bg-primary/20"
                      : t.kind === "user"
                        ? "border-border bg-background"
                        : "border-primary/50 bg-primary/10")
                  }
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t.title} · {new Date(t.when).toLocaleString()}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {t.body}
                </p>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard eyebrow="Section 06" title="Continue this situation">
          <div className="text-lg font-semibold text-foreground">Did anything change?</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell LIFELINE what you discovered, tried, or noticed next.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-background/40 focus-within:border-primary/50">
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value.slice(0, 2000))}
              placeholder="Example: I checked the soil and it is very wet..."
              rows={4}
              className="block w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-4 border-t border-border/80 bg-background/30 px-4 py-2.5">
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {observation.length.toLocaleString()} / 2,000
              </span>
              <button
                type="button"
                onClick={addObservation}
                disabled={observation.trim().length === 0 || isReanalyzing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_10px_30px_-12px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100"
              >
                {isReanalyzing ? "Re-evaluating..." : "Add observation"}
              </button>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
            Observations are saved to this situation and will feed the next LIFELINE re-analysis
            when Gemma is connected.
          </p>
        </SectionCard>

        {analysis.followUpQuestions.length > 0 && (
          <SectionCard eyebrow="Section 07" title="Follow-up questions">
            <ul className="space-y-2">
              {analysis.followUpQuestions.map((q) => (
                <li
                  key={q}
                  className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground/90"
                >
                  {q}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground/70">
          LIFELINE offers general guidance to help you think through your situation. It is not a
          substitute for professional advice in medical, legal, or emergency matters.
        </p>
      </main>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 animate-fade-in rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </span>
        <div className="h-px flex-1 bg-border/70" />
      </div>
      <h2 className="mt-3 text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ActionRow({ step, title, body }: { step: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-background text-xs font-semibold text-primary">
        {step}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</div>
      </div>
    </li>
  );
}

function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-[0.14] blur-3xl"
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
