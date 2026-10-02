export type Aspect = "1:1" | "4:3" | "3:4" | "16:9";

export interface PendingItem {
  kind: "pending";
  id: string;
  prompt: string;
  aspect: Aspect;
  requestId: string;
  statusUrl: string;
  createdAt: string; // ISO
}

export interface DoneItem {
  kind: "done";
  id: string;
  prompt: string;
  aspect: Aspect;
  createdAt: string;
  completedAt: string;
  imageUrl: string;
  model: string;
}

export type FeedItem = PendingItem | DoneItem;

export const ASPECTS: Aspect[] = ["1:1", "4:3", "3:4", "16:9"];

export function aspectRatioCss(a: Aspect): string {
  return a.replace(":", " / ");
}
