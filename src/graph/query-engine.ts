import { Graph, GraphEdge, RouteFilter } from './types';
import { GraphStore } from './store';

const edgeKey = (from: string, to: string) => `${from}->${to}`;

/**
 * Finds every "route" (multi-hop, simple path) through the graph that
 * satisfies all given filters, then returns the UNION of all nodes/edges
 * that appear on any such route as a single mergeable subgraph - this is
 * what makes the response directly renderable client-side, per the spec,
 * rather than a list of possibly-overlapping path arrays.
 *
 * - `start` filters must all pass on the route's first node.
 * - `end` filters must all pass on the route's last node.
 * - `any` filters must each be satisfied by *some* node on the route
 *   (not necessarily the same one).
 *
 * Traversal is a DFS with a per-path visited-set, so cycles can't cause
 * infinite recursion (routes are simple paths, no repeated nodes). This
 * is brute-force path enumeration - worst case exponential in a densely
 * connected graph, but fine for a graph this size (~50 nodes, shallow
 * layered fan-out). A production version handling much larger graphs
 * would want memoization or a max-depth cap.
 */
export function findMatchingSubgraph(store: GraphStore, filters: RouteFilter[]): Graph {
  const startFilters = filters.filter((f) => f.position === 'start');
  const endFilters = filters.filter((f) => f.position === 'end');
  const anyFilters = filters.filter((f) => f.position === 'any');

  const allNodes = store.getAllNodes();
  const candidateStarts = startFilters.length
    ? allNodes.filter((n) => startFilters.every((f) => f.predicate(n)))
    : allNodes;

  const resultNodeNames = new Set<string>();
  const resultEdgeKeys = new Set<string>();
  const resultEdges: GraphEdge[] = [];

  const commitPath = (path: string[]) => {
    for (const name of path) resultNodeNames.add(name);
    for (let i = 0; i < path.length - 1; i++) {
      const key = edgeKey(path[i], path[i + 1]);
      if (!resultEdgeKeys.has(key)) {
        resultEdgeKeys.add(key);
        resultEdges.push({ from: path[i], to: path[i + 1] });
      }
    }
  };

  const dfs = (current: string, path: string[], visited: Set<string>, satisfiedAny: Set<number>) => {
    const node = store.getNode(current)!;
    const newSatisfied = new Set(satisfiedAny);
    anyFilters.forEach((f, i) => {
      if (f.predicate(node)) newSatisfied.add(i);
    });

    // A route needs at least one edge - don't treat the start node alone as a route.
    if (path.length > 1) {
      const endsOk = endFilters.every((f) => f.predicate(node));
      const anyOk = newSatisfied.size === anyFilters.length;
      if (endsOk && anyOk) {
        commitPath(path);
      }
    }

    for (const neighbor of store.getNeighbors(current)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, path, visited, newSatisfied);
        path.pop();
        visited.delete(neighbor);
      }
    }
  };

  for (const start of candidateStarts) {
    dfs(start.name, [start.name], new Set([start.name]), new Set());
  }

  return {
    nodes: [...resultNodeNames].map((name) => store.getNode(name)!),
    edges: resultEdges,
  };
}
