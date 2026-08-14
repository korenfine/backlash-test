export interface Vulnerability {
  file: string;
  severity: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface GraphNode {
  name: string;
  kind: string;
  language?: string;
  path?: string;
  publicExposed?: boolean;
  vulnerabilities?: Vulnerability[];
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Shape of the raw input JSON, where `to` can be a single string or an array.
export interface RawNode {
  name: string;
  kind: string;
  language?: string;
  path?: string;
  publicExposed?: boolean;
  vulnerabilities?: Vulnerability[];
  metadata?: Record<string, unknown>;
}

export interface RawEdge {
  from: string;
  to: string | string[];
}

export interface RawGraph {
  nodes: RawNode[];
  edges: RawEdge[];
}

export type NodePredicate = (node: GraphNode) => boolean;
export type PredicateFactory = (params?: Record<string, string>) => NodePredicate;

export type FilterPosition = 'start' | 'end' | 'any';

export interface RouteFilter {
  position: FilterPosition;
  predicateName: string;
  predicate: NodePredicate;
}
