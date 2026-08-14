import { Graph, GraphEdge, GraphNode } from './types';

export class GraphStore {
  private readonly nodesByName: Map<string, GraphNode>;
  private readonly adjacency: Map<string, string[]>;
  private readonly edges: GraphEdge[];

  constructor(graph: Graph) {
    this.nodesByName = new Map(graph.nodes.map((n) => [n.name, n]));
    this.edges = graph.edges;

    this.adjacency = new Map();
    for (const node of graph.nodes) this.adjacency.set(node.name, []);
    for (const edge of graph.edges) {
      const list = this.adjacency.get(edge.from);
      if (list) list.push(edge.to);
    }
  }

  getNode(name: string): GraphNode | undefined {
    return this.nodesByName.get(name);
  }

  getAllNodes(): GraphNode[] {
    return [...this.nodesByName.values()];
  }

  getAllEdges(): GraphEdge[] {
    return this.edges;
  }

  getNeighbors(name: string): string[] {
    return this.adjacency.get(name) ?? [];
  }

  getFullGraph(): Graph {
    return { nodes: this.getAllNodes(), edges: this.edges };
  }
}
