export type MessageKind = "text" | "code";

export interface Message {
  readonly id: string;
  readonly index: number;
  readonly authorId: string;
  readonly authorName: string;
  readonly ts: number;
  readonly body: string;
  readonly kind: MessageKind;
}

export interface SearchHit {
  readonly id: string;
  readonly index: number;
  readonly snippet: string;
}

const ID_PREFIX = "msg-";
const ID_DIGITS = 8;

export function indexToId(index: number): string {
  if (!(Number.isInteger(index) && index >= 0 && index <= 99_999_999)) {
    throw new Error("indexToId: index out of range");
  }
  return ID_PREFIX + String(index).padStart(ID_DIGITS, "0");
}

export function idToIndex(id: string): number {
  if (!id.startsWith(ID_PREFIX)) {
    throw new Error(`Malformed message id: "${id}"`);
  }
  const digits = id.slice(ID_PREFIX.length);
  if (digits.length !== ID_DIGITS || !/^\d+$/.test(digits)) {
    throw new Error(`Malformed message id: "${id}"`);
  }
  return parseInt(digits, 10);
}
