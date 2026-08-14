import { GraphNode, NodePredicate, PredicateFactory } from './types';

/**
 * Node kinds treated as data/message sinks. The dataset only has "rds"
 * and "sqs" besides "service", but this stays a list (not a hardcoded
 * `=== 'rds'` check) so a future kind like "s3" or "kafka" is a one-line
 * addition here, not a code change anywhere else.
 */
export const SINK_KINDS = ['rds', 'sqs'];

/**
 * The extensibility point for the whole API: every named filter a client
 * can ask for lives here as `name -> (params) -> (node) => boolean`.
 * Adding a new queryable filter is exactly one entry in this map - no
 * changes needed in the query engine or the HTTP layer.
 */
export const predicateRegistry: Record<string, PredicateFactory> = {
  publicExposed: () => (node: GraphNode) => node.publicExposed === true,

  sink: () => (node: GraphNode) => SINK_KINDS.includes(node.kind),

  vulnerable: (params) => (node: GraphNode) => {
    const vulns = node.vulnerabilities ?? [];
    if (vulns.length === 0) return false;
    if (!params?.severity) return true;
    return vulns.some((v) => v.severity.toLowerCase() === params.severity!.toLowerCase());
  },

  kind: (params) => (node: GraphNode) => !!params?.kind && node.kind === params.kind,

  language: (params) => (node: GraphNode) => !!params?.language && node.language === params.language,
};

export function getPredicateNames(): string[] {
  return Object.keys(predicateRegistry);
}

export function resolvePredicate(name: string, params?: Record<string, string>): NodePredicate | undefined {
  const factory = predicateRegistry[name];
  return factory ? factory(params) : undefined;
}
