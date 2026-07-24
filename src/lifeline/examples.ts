import type { LifelineDomain } from "./types";

export interface LifelineExample {
  domain: LifelineDomain;
  label: string;
  prompt: string;
}

export const examples: LifelineExample[] = [
  {
    domain: "education",
    label: "Understanding something",
    prompt: "I don't understand Newton's laws.",
  },
  {
    domain: "agriculture",
    label: "Diagnosing a problem",
    prompt: "My maize leaves are turning yellow.",
  },
  {
    domain: "community",
    label: "Planning an initiative",
    prompt: "Our neighborhood has too much plastic waste.",
  },
];
