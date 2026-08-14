import { GraphStore } from '../../graph/store';
import { findMatchingSubgraph } from '../../graph/query-engine';
import { resolvePredicate } from '../../graph/predicates';
import { FilterPosition, Graph, RouteFilter } from '../../graph/types';

const POSITIONS: FilterPosition[] = ['start', 'end', 'any'];

/**
 * All business logic for the graph feature lives here: turning raw filter
 * names into RouteFilter[] and delegating to the query engine. The
 * controller only translates HTTP <-> this service; it has no graph/filter
 * logic of its own.
 */
export class GraphService {
  constructor(private readonly store: GraphStore) {}

  getFullGraph(): Graph {
    return this.store.getFullGraph();
  }

  // Names that don't match a registered predicate are silently dropped
  // rather than rejected, so an unrecognized filter just doesn't narrow
  // the result instead of failing the whole request.
  queryGraph(rawFilters: Partial<Record<FilterPosition, string[]>>): Graph {
    const filters: RouteFilter[] = [];

    for (const position of POSITIONS) {
      for (const name of rawFilters[position] ?? []) {
        const predicate = resolvePredicate(name);
        if (!predicate) continue;
        filters.push({ position, predicateName: name, predicate });
      }
    }

    if (filters.length === 0) {
      return this.store.getFullGraph();
    }

    return findMatchingSubgraph(this.store, filters);
  }
}
