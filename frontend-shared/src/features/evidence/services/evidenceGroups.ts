import type { EvidenceEvent } from './evidenceApi';

export interface EvidenceGroup {
  key: string;
  events: EvidenceEvent[];
  imageEvent: EvidenceEvent;
  occurredAt: string;
  riskScore: number;
  riskLevel: string;
}
const imagePriority: Record<string, number> = { uploaded: 4, local: 3, pending: 2, failed: 1, none: 0 };

/** Never infer grouping from timestamps, event names or visually similar pictures. */
export function groupEvidenceEvents(events: EvidenceEvent[]): EvidenceGroup[] {
  const grouped = new Map<string, EvidenceGroup>();
  for (const event of events) {
    const key = event.captureId ? `capture:${event.captureId}` : `event:${event.id}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {key,events:[event],imageEvent:event,occurredAt:event.occurredAt,riskScore:event.riskScore,riskLevel:event.riskLevel});
      continue;
    }
    current.events.push(event);
    if (event.occurredAt < current.occurredAt) current.occurredAt = event.occurredAt;
    if (event.riskScore > current.riskScore) {current.riskScore=event.riskScore;current.riskLevel=event.riskLevel;}
    const rank = (item: EvidenceEvent) => item.hasEvidence ? imagePriority[item.evidenceStatus] ?? 0 : -1;
    if (rank(event) > rank(current.imageEvent)) current.imageEvent = event;
  }
  return [...grouped.values()];
}
