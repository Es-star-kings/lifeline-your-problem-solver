import type { LifelineDomain } from "./types";

export interface LifelineExample {
  domain: LifelineDomain;
  label: string;
  prompt: string;
}

export const examples: LifelineExample[] = [
  { domain: "education", label: "EDUCATION", prompt: "I don't understand Newton's laws." },
  { domain: "agriculture", label: "AGRICULTURE", prompt: "My maize leaves are turning yellow." },
  { domain: "community", label: "COMMUNITY", prompt: "Our neighborhood has too much plastic waste." },
];