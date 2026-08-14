import { GraphStore } from '../src/graph/store';
import { findMatchingSubgraph } from '../src/graph/query-engine';
import { resolvePredicate } from '../src/graph/predicates';
import { Graph, RouteFilter } from '../src/graph/types';

function filter(position: RouteFilter['position'], predicateName: string, params?: Record<string, string>): RouteFilter {
  return { position, predicateName, predicate: resolvePredicate(predicateName, params)! };
}

function nodeNames(result: { nodes: { name: string }[] }): string[] {
  return result.nodes.map((n) => n.name).sort();
}

function edgePairs(result: { edges: { from: string; to: string }[] }): string[] {
  return result.edges.map((e) => `${e.from}->${e.to}`).sort();
}

describe('findMatchingSubgraph', () => {
  // gateway(public) -> svcA -> svcB(vulnerable) -> db(sink)
  //                       \-> svcC (dead end)
  const acyclicGraph: Graph = {
    nodes: [
      { name: 'gateway', kind: 'service', publicExposed: true, vulnerabilities: [] },
      { name: 'svcA', kind: 'service', publicExposed: false, vulnerabilities: [] },
      { name: 'svcB', kind: 'service', publicExposed: false, vulnerabilities: [{ file: 'f', severity: 'high', message: 'm' }] },
      { name: 'svcC', kind: 'service', publicExposed: false, vulnerabilities: [] },
      { name: 'db', kind: 'rds', publicExposed: false, vulnerabilities: [] },
    ],
    edges: [
      { from: 'gateway', to: 'svcA' },
      { from: 'svcA', to: 'svcB' },
      { from: 'svcA', to: 'svcC' },
      { from: 'svcB', to: 'db' },
    ],
  };

  it('filters routes starting at a public-exposed node', () => {
    const store = new GraphStore(acyclicGraph);
    const result = findMatchingSubgraph(store, [filter('start', 'publicExposed')]);
    expect(nodeNames(result)).toEqual(['db', 'gateway', 'svcA', 'svcB', 'svcC']);
    expect(edgePairs(result)).toEqual(
      ['gateway->svcA', 'svcA->svcB', 'svcA->svcC', 'svcB->db'].sort()
    );
  });

  it('filters routes ending at a sink, excluding dead-end branches', () => {
    const store = new GraphStore(acyclicGraph);
    const result = findMatchingSubgraph(store, [filter('end', 'sink')]);
    expect(nodeNames(result)).toEqual(['db', 'gateway', 'svcA', 'svcB']);
    expect(edgePairs(result)).toEqual(['gateway->svcA', 'svcA->svcB', 'svcB->db'].sort());
  });

  it('filters routes that touch a vulnerable node anywhere along the path', () => {
    const store = new GraphStore(acyclicGraph);
    const result = findMatchingSubgraph(store, [filter('any', 'vulnerable')]);
    expect(nodeNames(result)).toEqual(['db', 'gateway', 'svcA', 'svcB']);
    expect(edgePairs(result)).toEqual(['gateway->svcA', 'svcA->svcB', 'svcB->db'].sort());
  });

  it('combines start + end + any filters with AND semantics', () => {
    const store = new GraphStore(acyclicGraph);
    const result = findMatchingSubgraph(store, [
      filter('start', 'publicExposed'),
      filter('end', 'sink'),
      filter('any', 'vulnerable'),
    ]);
    expect(nodeNames(result)).toEqual(['db', 'gateway', 'svcA', 'svcB']);
    expect(edgePairs(result)).toEqual(['gateway->svcA', 'svcA->svcB', 'svcB->db'].sort());
  });

  it('returns an empty subgraph when no route satisfies the filters', () => {
    const store = new GraphStore(acyclicGraph);
    // svcC is a dead end that never reaches a sink.
    const onlySvcC: RouteFilter = {
      position: 'start',
      predicateName: 'custom',
      predicate: (n) => n.name === 'svcC',
    };
    const result = findMatchingSubgraph(store, [onlySvcC, filter('end', 'sink')]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('does not infinite-loop on a cyclic graph and dedupes shared edges', () => {
    const cyclicGraph: Graph = {
      nodes: [
        { name: 'x', kind: 'service', publicExposed: false, vulnerabilities: [] },
        { name: 'y', kind: 'service', publicExposed: false, vulnerabilities: [] },
        { name: 'z', kind: 'service', publicExposed: false, vulnerabilities: [] },
      ],
      edges: [
        { from: 'x', to: 'y' },
        { from: 'y', to: 'z' },
        { from: 'z', to: 'x' },
      ],
    };
    const store = new GraphStore(cyclicGraph);
    const result = findMatchingSubgraph(store, []);
    expect(nodeNames(result)).toEqual(['x', 'y', 'z']);
    expect(edgePairs(result)).toEqual(['x->y', 'y->z', 'z->x']);
  });
});
