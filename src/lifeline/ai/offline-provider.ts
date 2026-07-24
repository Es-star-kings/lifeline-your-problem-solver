import type {
  LifelineActionStep,
  LifelineAnalysis,
  LifelineDomain,
  LifelineResource,
  LifelineSuggestedTool,
  LifelineUrgency,
  SuggestedToolType,
} from "../types";
import type { LifelineAIContext, LifelineAIProvider } from "./provider";
import { normalizeAnalysis } from "./schema";

type DomainProfile = {
  domain: LifelineDomain;
  keywords: RegExp;
  base: (input: string) => {
    summary: string;
    explanation: string;
    userIntent: string;
    steps: LifelineActionStep[];
    followUps: string[];
    suggestedTools: LifelineSuggestedTool[];
    resources: LifelineResource[];
  };
};

const HIGH_URGENCY =
  /\b(emergency|urgent|bleeding|chest pain|can't breathe|cannot breathe|suicide|unconscious|severe|overdose|stroke|heart attack|dying|collapsed)\b/i;
const MED_URGENCY =
  /\b(today|deadline|tomorrow|failing|broken|lost|worried|scared|pain|fever|leak|no money|evicted|fired)\b/i;

function detectUrgency(input: string): LifelineUrgency {
  if (HIGH_URGENCY.test(input)) return "high";
  if (MED_URGENCY.test(input)) return "medium";
  return "low";
}

function firstSentence(s: string, max = 140): string {
  const clean = s.trim().replace(/\s+/g, " ");
  const dot = clean.search(/[.!?]/);
  const cut = dot > 20 ? clean.slice(0, dot + 1) : clean.slice(0, max);
  return cut.length < clean.length ? cut.replace(/[.!?]?$/, "…") : cut;
}

function buildActionStep(
  step: number,
  title: string,
  description: string,
  timeframe?: string,
): LifelineActionStep {
  return {
    id: `step-${step}`,
    step,
    title,
    description,
    timeframe,
    status: "pending",
  };
}

function buildTool(type: string, title: string, description: string): LifelineSuggestedTool {
  const normalizedType: SuggestedToolType =
    type === "notes" ||
    type === "quiz" ||
    type === "scenarios" ||
    type === "explanation" ||
    type === "study_plan" ||
    type === "checklist" ||
    type === "project_plan" ||
    type === "resource_finder"
      ? (type as SuggestedToolType)
      : "explanation";

  return {
    id: `${normalizedType}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    type: normalizedType,
    title,
    description,
  };
}

function buildResource(
  title: string,
  description: string,
  kind: LifelineResource["kind"] = "resource",
  locationHint?: string,
): LifelineResource {
  return {
    id: `${kind}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    description,
    kind,
    locationHint,
  };
}

const profiles: DomainProfile[] = [
  {
    domain: "healthcare",
    keywords:
      /\b(pain|fever|sick|ill|doctor|clinic|symptom|injury|wound|medic|breath|blood|cough|infection|pregnan|dizzy|nausea)\b/i,
    base: (input) => ({
      summary: firstSentence(input),
      explanation:
        "This looks like a health concern. Getting clear on the symptoms and how quickly they are changing will decide whether this needs care today or can be watched.",
      userIntent: "Understand the concern and decide the safest next step.",
      steps: [
        buildActionStep(
          1,
          "Describe the symptoms precisely",
          "Note what you feel, when it started, and how it's changed since.",
        ),
        buildActionStep(
          2,
          "Check for danger signs",
          "Trouble breathing, chest pain, heavy bleeding, confusion, or a very high fever mean seek care now.",
        ),
        buildActionStep(
          3,
          "Talk to someone qualified",
          "Reach a clinic, pharmacist, or trusted health worker with your notes.",
        ),
      ],
      followUps: [
        "When did the symptoms start?",
        "Have they gotten worse, better, or stayed the same?",
        "Any existing conditions or medications involved?",
      ],
      suggestedTools: [
        buildTool(
          "checklist",
          "Safety checklist",
          "Create a short checklist of symptoms, timing, and urgent warning signs.",
        ),
        buildTool(
          "notes",
          "Symptom notes",
          "Turn your observations into a clear note for a clinician or caregiver.",
        ),
      ],
      resources: [
        buildResource(
          "Professional care guidance",
          "Use this workspace to gather symptoms and prepare for a clinician conversation.",
          "service",
        ),
      ],
    }),
  },
  {
    domain: "agriculture",
    keywords:
      /\b(crop|farm|soil|harvest|livestock|cattle|goat|chicken|maize|rice|seed|planting|pest|rain|drought|irrigation|fertili[sz]er)\b/i,
    base: (input) => ({
      summary: firstSentence(input),
      explanation:
        "This looks like a farming or land-use situation. The right move usually depends on what stage the crop or animals are in and what's actually visible on the ground.",
      userIntent: "Identify the likely issue and prepare a practical troubleshooting plan.",
      steps: [
        buildActionStep(
          1,
          "Inspect closely",
          "Walk the affected area and note leaves, roots, soil, or animals showing the issue.",
        ),
        buildActionStep(
          2,
          "Rule out the common causes",
          "Water, pests, disease, or nutrients — check each before treating.",
        ),
        buildActionStep(
          3,
          "Ask a local extension worker",
          "They know what's going around in your area and can confirm the pattern.",
        ),
      ],
      followUps: [
        "How long has this been happening?",
        "How much of the field or herd is affected?",
        "What's the weather been like recently?",
      ],
      suggestedTools: [
        buildTool(
          "project_plan",
          "Agriculture troubleshooting plan",
          "Turn the issue into a practical troubleshooting checklist with the most likely causes.",
        ),
        buildTool(
          "notes",
          "Field notes",
          "Record symptoms, timing, and visible conditions so you can compare changes.",
        ),
      ],
      resources: [
        buildResource(
          "Local agricultural support",
          "Prepare a simple summary to share with extension workers or local support services.",
          "service",
        ),
      ],
    }),
  },
  {
    domain: "education",
    keywords:
      /\b(learn|study|school|class|exam|test|teacher|student|homework|understand|subject|math|read|write)\b/i,
    base: (input) => ({
      summary: firstSentence(input),
      explanation:
        "This is a learning problem. Progress comes from narrowing down exactly where understanding breaks and practicing that one piece.",
      userIntent: "Understand the gap and build a focused study plan.",
      steps: [
        buildActionStep(
          1,
          "Find the exact stuck point",
          "Pick one problem you can't solve and mark where you get lost.",
        ),
        buildActionStep(
          2,
          "Get one clear explanation",
          "Ask a teacher, look for a short video, or find a worked example of that step.",
        ),
        buildActionStep(
          3,
          "Practice three of the same kind",
          "Do it again on three similar problems before moving on.",
        ),
      ],
      followUps: [
        "What's the specific topic or skill?",
        "When is this needed by?",
        "What have you already tried?",
      ],
      suggestedTools: [
        buildTool(
          "notes",
          "Study notes",
          "Turn the topic into concise notes that you can review later.",
        ),
        buildTool(
          "quiz",
          "Practice quiz",
          "Create a short quiz around the weak area so you can test yourself.",
        ),
        buildTool(
          "study_plan",
          "Study plan",
          "Create a focused plan for the next few study sessions.",
        ),
      ],
      resources: [
        buildResource(
          "Learning support",
          "Keep this workspace ready for explanations, notes, and practice questions.",
          "resource",
        ),
      ],
    }),
  },
  {
    domain: "community",
    keywords:
      /\b(neighbor|community|village|town|water|road|electricity|power|dispute|family|conflict|meeting|help|group)\b/i,
    base: (input) => ({
      summary: firstSentence(input),
      explanation:
        "This is a situation involving other people. The useful next move is usually one clear conversation, not a plan built alone.",
      userIntent: "Frame the issue clearly and decide the next responsible action.",
      steps: [
        buildActionStep(
          1,
          "Write down what you want",
          "One sentence: what would 'better' look like for you?",
        ),
        buildActionStep(
          2,
          "Pick who to talk to first",
          "The one person whose action would change the most.",
        ),
        buildActionStep(
          3,
          "Have a short, calm conversation",
          "Say what you see, what you need, and listen to their side.",
        ),
      ],
      followUps: [
        "Who else is affected?",
        "Has anyone tried to resolve this before?",
        "What outcome would be good enough?",
      ],
      suggestedTools: [
        buildTool(
          "project_plan",
          "Community action plan",
          "Convert the situation into a practical plan with roles and next steps.",
        ),
        buildTool(
          "checklist",
          "Action checklist",
          "Create a concise checklist of who should do what and when.",
        ),
      ],
      resources: [
        buildResource(
          "Community coordination",
          "Use this workspace to track the people, conversations, and next steps involved.",
          "service",
        ),
      ],
    }),
  },
];

const productivityProfile: DomainProfile = {
  domain: "productivity",
  keywords: /.*/,
  base: (input) => ({
    summary: firstSentence(input),
    explanation:
      "Situations like this usually feel bigger than they are because everything is mixed together. Separating what's known from what's uncertain is what unblocks the next move.",
    userIntent: "Reduce the problem into a clear, actionable plan.",
    steps: [
      buildActionStep(
        1,
        "Write down what you already know",
        "Facts only — no worries, no what-ifs.",
      ),
      buildActionStep(
        2,
        "Name the single biggest unknown",
        "The one answer that would change what you'd do next.",
      ),
      buildActionStep(
        3,
        "Take one small action today",
        "The smallest step that produces new information.",
      ),
    ],
    followUps: [
      "What outcome would count as 'resolved'?",
      "What's forcing the timing?",
      "What have you already tried?",
    ],
    suggestedTools: [
      buildTool(
        "project_plan",
        "Project plan",
        "Turn the problem into a manageable project plan with clear milestones.",
      ),
      buildTool(
        "checklist",
        "Task checklist",
        "Create a checklist of the next small actions to take.",
      ),
    ],
    resources: [
      buildResource(
        "Planning support",
        "Use this workspace to turn a vague problem into an actionable plan.",
        "resource",
      ),
    ],
  }),
};

function chooseProfile(text: string): DomainProfile {
  for (const p of profiles) {
    if (p.keywords.test(text)) return p;
  }
  return productivityProfile;
}

function analyzeText(text: string, urgencyHint?: LifelineUrgency): LifelineAnalysis {
  const profile = chooseProfile(text);
  const parts = profile.base(text);
  const urgency = urgencyHint ?? detectUrgency(text);
  const analysis = normalizeAnalysis({
    category: profile.domain,
    domain: profile.domain,
    problemSummary: parts.summary,
    userIntent: parts.userIntent,
    urgency,
    explanation: parts.explanation,
    actionPlan: parts.steps,
    suggestedTools: parts.suggestedTools,
    followUpQuestions: parts.followUps,
    resources: parts.resources,
    safetyNote:
      urgency === "high"
        ? "This may be serious. If someone is in immediate danger, contact local emergency services or a qualified professional right now."
        : undefined,
  });

  return analysis;
}

function continueAnalysis(ctx: LifelineAIContext): LifelineAnalysis {
  const situation = ctx.situation!;
  const observation = ctx.newObservation ?? "";
  const combined = `${situation.input}\n${observation}`;
  const base = analyzeText(combined, detectUrgency(observation) === "high" ? "high" : undefined);

  const obsCount = situation.observations.length + 1;
  const updatedSteps: LifelineActionStep[] = [
    buildActionStep(
      1,
      "Factor in the new observation",
      `You reported: “${firstSentence(observation, 120)}”. Adjust the plan around this before continuing.`,
    ),
    ...base.actionPlan.slice(0, 3).map((s, i) => ({ ...s, step: i + 2 })),
  ];

  return {
    ...base,
    problemSummary: base.problemSummary,
    explanation: `Update ${obsCount}: ${base.explanation}`,
    actionPlan: updatedSteps,
  };
}

/**
 * Offline intelligence provider. No network, no API keys. Uses lightweight
 * keyword + urgency heuristics so the app is always usable.
 */
export const offlineProvider: LifelineAIProvider = {
  name: "Offline intelligence",

  isAvailable() {
    return true;
  },

  async analyzeProblem(ctx, signal): Promise<LifelineAnalysis> {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 700);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Analysis cancelled", "AbortError"));
      });
    });
    if (ctx.situation && ctx.newObservation) {
      return continueAnalysis(ctx);
    }
    return analyzeText(ctx.input);
  },
};
