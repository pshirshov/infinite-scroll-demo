import { type Message } from "./Message.js";
import { indexToId } from "./Message.js";
import { rngForIndex } from "./prng.js";

export interface GenContext {
  readonly seed: number;
  readonly baseTs: number;
  readonly avgGapMs: number;
  readonly authors: readonly { id: string; name: string }[];
  readonly totalCount: number;
}

const WORDS = [
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need",
  "this", "that", "these", "those", "it", "he", "she", "they",
  "we", "you", "I", "me", "him", "her", "us", "them",
  "what", "which", "who", "when", "where", "why", "how",
  "all", "each", "every", "some", "any", "more", "most",
  "other", "no", "not", "only", "same", "so", "than", "too",
  "very", "just", "well", "also", "back", "even", "still",
  "way", "time", "day", "year", "work", "part", "place",
  "case", "group", "number", "point", "problem", "fact",
  "get", "make", "go", "know", "take", "see", "come", "think",
  "look", "want", "give", "use", "find", "tell", "ask",
  "seem", "feel", "try", "leave", "call", "keep", "let",
  "begin", "show", "hear", "play", "run", "move", "live",
  "believe", "hold", "bring", "happen", "write", "provide",
  "sit", "stand", "lose", "pay", "meet", "include", "continue",
  "set", "learn", "change", "lead", "understand", "watch",
  "follow", "stop", "create", "speak", "read", "spend",
  "grow", "open", "walk", "offer", "remember", "consider",
  "appear", "buy", "wait", "serve", "die", "send", "expect",
  "build", "stay", "fall", "cut", "reach", "kill", "remain",
];

const CODE_SNIPPETS = [
  [
    "function greet(name: string): string {",
    "  return `Hello, ${name}!`;",
    "}",
  ],
  [
    "const items = data.map((x) => ({",
    "  id: x.id,",
    "  value: x.value * 2,",
    "}));",
  ],
  [
    "async function fetchData(url: string): Promise<unknown> {",
    "  const res = await fetch(url);",
    "  if (!res.ok) throw new Error(`HTTP ${res.status}`);",
    "  return res.json();",
    "}",
  ],
  [
    "for (let i = 0; i < arr.length; i++) {",
    "  if (arr[i] === target) {",
    "    return i;",
    "  }",
    "}",
    "return -1;",
  ],
  [
    "interface Config {",
    "  host: string;",
    "  port: number;",
    "  timeout?: number;",
    "}",
  ],
  [
    "const [state, setState] = useState(initialValue);",
    "useEffect(() => {",
    "  setState(compute(state));",
    "}, [state]);",
  ],
  [
    "try {",
    "  const result = riskyOperation();",
    "  return { ok: true, value: result };",
    "} catch (err) {",
    "  return { ok: false, error: String(err) };",
    "}",
  ],
  [
    "export class EventBus<T> {",
    "  private listeners: Set<(v: T) => void> = new Set();",
    "  subscribe(fn: (v: T) => void): () => void {",
    "    this.listeners.add(fn);",
    "    return () => this.listeners.delete(fn);",
    "  }",
    "  emit(v: T): void {",
    "    this.listeners.forEach((fn) => fn(v));",
    "  }",
    "}",
  ],
];

function pickNonEmpty<T>(arr: readonly T[], idx: number): T {
  if (arr.length === 0) throw new Error("pickNonEmpty: empty array");
  const item = arr[idx % arr.length];
  if (item === undefined) throw new Error("pickNonEmpty: unreachable");
  return item;
}

function pickWord(rng: () => number): string {
  const idx = Math.floor(rng() * WORDS.length);
  return pickNonEmpty(WORDS, idx);
}

function buildSentence(rng: () => number): string {
  const len = 4 + Math.floor(rng() * 10);
  const words: string[] = [];
  for (let i = 0; i < len; i++) {
    words.push(pickWord(rng));
  }
  const first = words[0];
  if (first !== undefined) {
    words[0] = first.charAt(0).toUpperCase() + first.slice(1);
  }
  return words.join(" ") + ".";
}

function buildTextBody(rng: () => number): string {
  const lineCount = 1 + Math.floor(rng() * 20);
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const sentencesInLine = 1 + Math.floor(rng() * 3);
    const parts: string[] = [];
    for (let j = 0; j < sentencesInLine; j++) {
      parts.push(buildSentence(rng));
    }
    lines.push(parts.join(" "));
  }
  return lines.join("\n");
}

function buildCodeBody(rng: () => number): string {
  const snippetIdx = Math.floor(rng() * CODE_SNIPPETS.length);
  const snippet = pickNonEmpty(CODE_SNIPPETS, snippetIdx);
  return "```\n" + snippet.join("\n") + "\n```";
}

export function generateMessage(ctx: GenContext, index: number): Message {
  const rng = rngForIndex(ctx.seed, index);

  const authorIdx = Math.floor(rng() * ctx.authors.length);
  const author = pickNonEmpty(ctx.authors, authorIdx);

  // 10% of messages are code blocks
  const isCode = rng() < 0.1;

  const jitter = (rng() - 0.5) * ctx.avgGapMs;
  const ts = ctx.baseTs - (ctx.totalCount - 1 - index) * ctx.avgGapMs + jitter;

  const body = isCode ? buildCodeBody(rng) : buildTextBody(rng);

  return {
    id: indexToId(index),
    index,
    authorId: author.id,
    authorName: author.name,
    ts: Math.round(ts),
    body,
    kind: isCode ? "code" : "text",
  };
}
