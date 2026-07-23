import type {
  LifelineActionStep,
  LifelineAnalysis,
  LifelineDomain,
  LifelineUrgency,
} from "../types";
import type { LifelineAIContext, LifelineAIProvider } from "./provider";

type DomainProfile = {
  domain: LifelineDomain;
  keywords: RegExp;
  base: (input: string) => {
    summary: string;
    explanation: string;
    steps: LifelineActionStep[];
    followUps: string[];
  };
};

const HIGH_URGENCY = /\b(emergency|urgent|bleeding|chest pain|can't breathe|cannot breathe|suicide|unconscious|severe|overdose|stroke|heart attack|dying|collapsed)\b/i;
const MED_URGENCY = /\b(today|deadline|tomorrow|failing|broken|lost|worried|scared|pain|fever|leak|no money|evicted|fired)\b/i;

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

const profiles: DomainProfile[] = [
  {
    domain: "healthcare",
    keywords: /\b(pain|fever|sick|ill|doctor|clinic|symptom|injury|wound|medic|breath|blood|cough|infection|pregnan|dizzy|nausea)\b/i,
    base: (input) => ({
      summary: firstSentence(input),
      explanation:
        "This looks like a health concern. Getting clear on the symptoms and how quickly they are changing will decide whether this needs care today or can be watched.",
      steps: [
        { step: 1, title: "Describe the symptoms precisely", description: "Note what you feel, when it started, and how it's changed since." },
        { step: 2, title: "Check for danger signs", description: "Trouble breathing, chest pain, heavy bleeding, confusion, or a very high fever mean seek care now." },
        { step: 3, title: "Talk to someone qualified", description: "Reach a clinic, pharmacist, or trusted health worker with your notes." },
      ],
      followUps: [
        "When did the symptoms start?",
        "Have they gotten worse, better, or stayed the same?",
        "Any existing conditions or medications involved?",
      ],
    }),
  },
  {
    domain: "agriculture",
    keywords: /\b(crop|farm|soil|harvest|livestock|cattle|goat|chicken|maize|rice|seed|planting|pest|rain|drought|irrigation|fertili[sz]er)\b/i,
    base: (input) => ({
      summary: firstSentence(input),
      explanation:
        "This looks like a farming or land-use situation. The right move usually depends on what stage the crop or animals are in and what's actually visible on the ground.",
      steps: [
        { step: 1, title: "Inspect closely", description: "Walk the affected area and note leaves, roots, soil, or animals showing the issue." },
        { step: 2, title: "Rule out the common causes", description: "Water, pests, disease, or nutrients — check each before treating." },
        { step: 3, title: "Ask a local extension worker", description: "They know what's going around in your area and can confirm the pattern." },
      ],
      followUps: [
        "How long has this been happening?",
        "How much of the field or herd is affected?",
        "What's the weather been like recently?",
      ],
    }),
  },
  {
    domain: "education",
    keywords: /\b(learn|study|school|class|exam|test|teacher|student|homework|understand|subject|math|read|write)\b/i,
    base: (input) => ({
      summary: firstSentence(input),
      explanation:
        "This is a learning problem. Progress comes from narrowing down exactly where understanding breaks and practicing that one piece.",
      steps: [
        { step: 1, title: "Find the exact stuck point", description: "Pick one problem you can't solve and mark where you get lost." },
        { step: 2, title: "Get one clear explanation", description: "Ask a teacher, look for a short video, or find a worked example of that step." },
        { step: 3, title: "Practice three of the same kind", description: "Do it again on three similar problems before moving on." },
      ],
      followUps: [
        "What's the specific topic or skill?",
        "When is this needed by?",
        "What have you already tried?",
      ],
    }),
  },
  {
    domain: "community",
    keywords: /\b(neighbor|community|village|town|water|road|electricity|power|dispute|family|conflict|meeting|help|group)\b/i,
    base: (input) => ({
      summary: firstSentence(input),
      explanation:
        "This is a situation involving other people. The useful next move is usually one clear conversation, not a plan built alone.",
      steps: [
        { step: 1, title: "Write down what you want", description: "One sentence: what would 'better' look like for you?" },
        { step: 2, title: "Pick who to talk to first", description: "The one person whose action would change the most." },
        { step: 3, title: "Have a short, calm conversation", description: "Say what you see, what you need, and listen to their side." },
      ],
      followUps: [
        "Who else is affected?",
        "Has anyone tried to resolve this before?",
        "What outcome would be good enough?",
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
    steps: [
      { step: 1, title: "Write down what you already know", description: "Facts only — no worries, no what-ifs." },
      { step: 2, title: "Name the single biggest unknown", description: "The one answer that would change what you'd do next." },
      { step: 3, title: "Take one small action today", description: "The smallest step that produces new information." },
    ],
    followUps: [
      "What outcome would count as 'resolved'?",
      "What's forcing the timing?",
      "What have you already tried?",
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
  const analysis: LifelineAnalysis = {
    domain: profile.domain,
    problemSummary: parts.summary,
    urgency,
    explanation: parts.explanation,
    actionPlan: parts.steps,
    followUpQuestions: parts.followUps,
  };
  if (urgency === "high") {
    analysis.safetyNote =
      "This may be serious. If someone is in immediate danger, contact local emergency services or a qualified professional right now.";
  }
  return analysis;
}

function continueAnalysis(ctx: LifelineAIContext): LifelineAnalysis {
  const situation = ctx.situation!;
  const observation = ctx.newObservation ?? "";
  const combined = `${situation.input}\n${observation}`;
  const base = analyzeText(combined, detectUrgency(observation) === "high" ? "high" : undefined);

  const obsCount = situation.observations.length + 1;
  const updatedSteps: LifelineActionStep[] = [
    {
      step: 1,
      title: "Factor in the new observation",
      description: `You reported: “${firstSentence(observation, 120)}”. Adjust the plan around this before continuing.`,
    },
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