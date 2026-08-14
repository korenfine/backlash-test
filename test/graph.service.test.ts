import { GraphStore } from '../src/graph/store';
import { GraphService } from '../src/api/graph/graph.service';
import { Graph } from '../src/graph/types';

const graph: Graph = {
  nodes: [
    { name: 'gateway', kind: 'service', publicExposed: true, vulnerabilities: [] },
    { name: 'svcA', kind: 'service', publicExposed: false, vulnerabilities: [] },
    { name: 'db', kind: 'rds', publicExposed: false, vulnerabilities: [] },
  ],
  edges: [
    { from: 'gateway', to: 'svcA' },
    { from: 'svcA', to: 'db' },
  ],
};

describe('GraphService', () => {
  it('returns the full graph when queried with no filters', () => {
    const service = new GraphService(new GraphStore(graph));
    const result = service.queryGraph({});
    expect(result.nodes.length).toBe(3);
    expect(result.edges.length).toBe(2);
    expect(result).toEqual(service.getFullGraph());
  });

  it('resolves filter names into a matching subgraph', () => {
    const service = new GraphService(new GraphStore(graph));
    const result = service.queryGraph({ start: ['publicExposed'], end: ['sink'] });
    expect(result.nodes.map((n) => n.name).sort()).toEqual(['db', 'gateway', 'svcA']);
  });

  it('ignores an unregistered filter name instead of throwing', () => {
    const service = new GraphService(new GraphStore(graph));
    const result = service.queryGraph({ any: ['not-a-real-filter'] });
    expect(result).toEqual(service.getFullGraph());
  });

  it('applies the valid filters in a mix and drops only the unknown one', () => {
    const service = new GraphService(new GraphStore(graph));
    const result = service.queryGraph({ start: ['publicExposed'], any: ['not-a-real-filter'] });
    expect(result.nodes.map((n) => n.name).sort()).toEqual(['db', 'gateway', 'svcA']);
  });
});
