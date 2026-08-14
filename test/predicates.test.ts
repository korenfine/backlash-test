import { resolvePredicate, getPredicateNames } from '../src/graph/predicates';
import { GraphNode } from '../src/graph/types';

const makeNode = (overrides: Partial<GraphNode>): GraphNode => ({
  name: 'n',
  kind: 'service',
  publicExposed: false,
  vulnerabilities: [],
  ...overrides,
});

describe('predicate registry', () => {
  it('lists the required built-in predicates', () => {
    expect(getPredicateNames()).toEqual(
      expect.arrayContaining(['publicExposed', 'sink', 'vulnerable'])
    );
  });

  it('publicExposed matches only nodes with publicExposed: true', () => {
    const predicate = resolvePredicate('publicExposed')!;
    expect(predicate(makeNode({ publicExposed: true }))).toBe(true);
    expect(predicate(makeNode({ publicExposed: false }))).toBe(false);
  });

  it('sink matches rds/sqs kinds and not service', () => {
    const predicate = resolvePredicate('sink')!;
    expect(predicate(makeNode({ kind: 'rds' }))).toBe(true);
    expect(predicate(makeNode({ kind: 'sqs' }))).toBe(true);
    expect(predicate(makeNode({ kind: 'service' }))).toBe(false);
  });

  it('vulnerable matches nodes with any vulnerability by default', () => {
    const predicate = resolvePredicate('vulnerable')!;
    expect(predicate(makeNode({ vulnerabilities: [] }))).toBe(false);
    expect(
      predicate(makeNode({ vulnerabilities: [{ file: 'f', severity: 'high', message: 'm' }] }))
    ).toBe(true);
  });

  it('vulnerable respects an optional severity param', () => {
    const predicate = resolvePredicate('vulnerable', { severity: 'high' })!;
    expect(
      predicate(makeNode({ vulnerabilities: [{ file: 'f', severity: 'medium', message: 'm' }] }))
    ).toBe(false);
    expect(
      predicate(makeNode({ vulnerabilities: [{ file: 'f', severity: 'high', message: 'm' }] }))
    ).toBe(true);
  });

  it('returns undefined for an unknown predicate name', () => {
    expect(resolvePredicate('doesNotExist')).toBeUndefined();
  });
});
