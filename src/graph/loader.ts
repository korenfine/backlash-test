import { readFileSync } from 'fs';
import { Graph, GraphEdge, RawGraph } from './types';

/**
 * The source data mixes `to: string` and `to: string[]` on edges (see
 * e.g. the "consign-service" edge vs. the rest). Normalize both shapes
 * into a flat list of single from->to pairs so the rest of the codebase
 * never has to think about this quirk.
 */
function normalizeEdges(raw: RawGraph['edges']): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const rawEdge of raw) {
    const targets = Array.isArray(rawEdge.to) ? rawEdge.to : [rawEdge.to];
    for (const to of targets) {
      edges.push({ from: rawEdge.from, to });
    }
  }
  return edges;
}

/**
 * The dataset has at least one edge target ("assurance-service") that is
 * never declared as a node. Rather than crash or silently drop the edge
 * (which would corrupt the graph a client tries to render), synthesize a
 * placeholder node of kind "unknown" for any referenced-but-undeclared
 * name so every edge endpoint always resolves to a real node.
 */
function fillMissingNodes(graph: Graph): void {
  const known = new Set(graph.nodes.map((n) => n.name));
  const missing = new Set<string>();
  for (const edge of graph.edges) {
    if (!known.has(edge.from)) missing.add(edge.from);
    if (!known.has(edge.to)) missing.add(edge.to);
  }
  for (const name of missing) {
    graph.nodes.push({ name, kind: 'unknown', publicExposed: false, vulnerabilities: [] });
  }
}

export function parseGraph(raw: RawGraph): Graph {
  const graph: Graph = {
    nodes: raw.nodes.map((n) => ({
      ...n,
      publicExposed: n.publicExposed ?? false,
      vulnerabilities: n.vulnerabilities ?? [],
    })),
    edges: normalizeEdges(raw.edges),
  };
  fillMissingNodes(graph);
  return graph;
}

export function loadGraphFromFile(filePath: string): Graph {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as RawGraph;
  return parseGraph(raw);
}
