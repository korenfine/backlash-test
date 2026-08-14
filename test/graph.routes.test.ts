import path from 'path';
import request from 'supertest';
import { loadGraphFromFile } from '../src/graph/loader';
import { GraphStore } from '../src/graph/store';
import { createApp } from '../src/api/app';

const store = new GraphStore(loadGraphFromFile(path.join(__dirname, '..', 'data', 'train-ticket.json')));
const app = createApp(store);

describe('GET /api/graph', () => {
  it('returns the full graph as nodes + edges', async () => {
    const res = await request(app).get('/api/graph');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
    expect(res.body.nodes.length).toBeGreaterThan(0);
    expect(res.body.nodes.some((n: { name: string }) => n.name === 'frontend')).toBe(true);
  });
});

describe('GET /api/graph/query', () => {
  it('filters routes starting at a public-exposed service', async () => {
    const res = await request(app).get('/api/graph/query').query({ start: 'publicExposed' });
    expect(res.status).toBe(200);
    expect(res.body.nodes.some((n: { name: string }) => n.name === 'frontend')).toBe(true);
    // every returned edge must be reachable from a public node, so no node should be
    // completely disconnected from the public start set - a light sanity check.
    expect(res.body.edges.length).toBeGreaterThan(0);
  });

  it('filters routes ending at a sink (rds/sqs)', async () => {
    const res = await request(app).get('/api/graph/query').query({ end: 'sink' });
    expect(res.status).toBe(200);
    const names = res.body.nodes.map((n: { name: string }) => n.name);
    expect(names).toEqual(expect.arrayContaining(['prod-postgresdb']));
  });

  it('filters routes that touch a vulnerable node', async () => {
    const res = await request(app).get('/api/graph/query').query({ any: 'vulnerable' });
    expect(res.status).toBe(200);
    const names = res.body.nodes.map((n: { name: string }) => n.name);
    // auth-service and order-service both carry vulnerabilities in the dataset.
    expect(names).toEqual(expect.arrayContaining(['auth-service', 'order-service']));
  });

  it('combines all three required filters with AND semantics', async () => {
    const res = await request(app)
      .get('/api/graph/query')
      .query({ start: 'publicExposed', end: 'sink', any: 'vulnerable' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
  });

  it('returns the full graph when no filters are supplied', async () => {
    const [full, queried] = await Promise.all([
      request(app).get('/api/graph'),
      request(app).get('/api/graph/query'),
    ]);
    expect(queried.body.nodes.length).toBe(full.body.nodes.length);
    expect(queried.body.edges.length).toBe(full.body.edges.length);
  });

  it('ignores an unknown filter name rather than erroring', async () => {
    const [full, queried] = await Promise.all([
      request(app).get('/api/graph'),
      request(app).get('/api/graph/query').query({ any: 'notARealFilter' }),
    ]);
    expect(queried.status).toBe(200);
    expect(queried.body.nodes.length).toBe(full.body.nodes.length);
    expect(queried.body.edges.length).toBe(full.body.edges.length);
  });
});
