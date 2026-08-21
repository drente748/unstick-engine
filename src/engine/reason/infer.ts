/* ============================================================
   reason/infer — Phase 2 pipeline entry.

   Consumes a TaskGraph (Phase 1 output) and produces the full
   reasoning layer: typed entities + beliefs + archetype match.
   NEVER re-parses text; never mutates the graph's facts — only
   annotates entity types (additive) and derives beliefs.

   English-only, deterministic.
   ============================================================ */

import type { Belief, TaskGraph } from "../types-v5";
import { annotateEntityTypes } from "./entityTypes";
import { deriveBeliefs } from "./beliefs";
import { matchArchetype, type ArchetypeMatch } from "./archetypes";

export interface InferenceResult {
  /** The same graph, with entityType annotations added. */
  graph: TaskGraph;
  beliefs: Belief[];
  archetype: ArchetypeMatch | null;
  /** How many entities got a semantic type. */
  typedCount: number;
}

/**
 * Run the full reasoning pass over a graph.
 * Deterministic: same graph in, same result out.
 */
export function inferFromGraph(g: TaskGraph): InferenceResult {
  const typedCount = annotateEntityTypes(g.entities);
  const beliefs = deriveBeliefs(g);
  const archetype = matchArchetype(g);
  return { graph: g, beliefs, archetype, typedCount };
}
