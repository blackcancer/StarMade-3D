import { readStarMadeInspectionStream, type InspectionBlueprintNode, type SegmentDataLike } from '../../src/index.js';

/** Retain the completed scene, while allowing the host to render each incoming segment. */
export async function loadStreamingBlueprint(url: string, signal: AbortSignal, onSegment: (node: InspectionBlueprintNode, segment: SegmentDataLike) => Promise<void>) {
  const started = performance.now();
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`Blueprint stream HTTP ${response.status}`);
  const reader = response.body.getReader();
  let transferredBytes = 0, firstSegmentMs: number | undefined;
  async function* chunks() {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        transferredBytes += value.length;
        yield value;
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
  }
  const entities = new Map<string, InspectionBlueprintNode & { segments: SegmentDataLike[]; headerVersion: number; usedSlots: number }>();
  for await (const event of readStarMadeInspectionStream(chunks(), signal)) {
    if (event.kind === 'entity') {
      if (entities.has(event.node.id) || (event.node.parentId && !entities.has(event.node.parentId))) throw new Error('Invalid streamed hierarchy');
      entities.set(event.node.id, { ...event.node, segments: [] });
    } else if (event.kind === 'segment') {
      const node = entities.get(event.entityId);
      if (!node) throw new Error('Unknown streamed entity');
      if (node.segments.some(s => s.x === event.segment.x && s.y === event.segment.y && s.z === event.segment.z)) throw new Error('Duplicate streamed segment');
      node.segments.push(event.segment); node.headerVersion = event.headerVersion; node.usedSlots++;
      firstSegmentMs ??= performance.now() - started;
      await onSegment(node, event.segment);
    }
  }
  const nodes = [...entities.values()];
  return { headerVersion: nodes[0]?.headerVersion ?? 0, usedSlots: nodes.reduce((n, e) => n + e.usedSlots, 0), segments: nodes[0]?.segments ?? [], entities: nodes,
    streaming: { firstSegmentMs, totalMs: performance.now() - started, transferredBytes, segments: nodes.reduce((n, e) => n + e.segments.length, 0), status: 'complete' } };
}
