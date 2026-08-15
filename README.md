# Train Ticket Graph API

Loads the provided Train Ticket microservices graph and exposes it through a
REST API with a generic, extensible filter engine for querying it.

## Design decisions

**What is a "route"?** The spec never defines it — it could mean one direct
`A → B` call, or a full multi-hop chain. I went with **multi-hop paths**: a
single edge is just a path of length 1 so nothing is lost, and it's the only
reading where combining filters with AND is meaningful — "starts public AND
ends in a sink" is structurally impossible as a single edge in a layered
architecture, but as a chain it answers a real question: is there a path
from an internet-facing service, through a vulnerable node, down to a
database? A route matches a filter set if every `start` filter passes on
its first node, every `end` filter passes on its last node, and every `any`
filter is satisfied by *some* node on the route.

**Response shape**: one merged subgraph (union of every node/edge across
all matching routes), not a list of separate paths — this is what the spec
asks for ("return a graph structure... easy to render") and is directly
consumable by graph-viz libraries (Cytoscape.js, react-flow, ...) without
client-side reshaping.

**Assumptions**:
- `edges[].to` is inconsistently typed in the source (usually an array, one
  edge has a bare string) — normalized to flat `{from, to}` pairs on load.
- `assurance-service` is referenced by edges but never declared as a node —
  a placeholder node (`kind: "unknown"`) is synthesized so every edge always
  resolves, instead of crashing or silently dropping the edge.
- Missing `publicExposed` → `false`, missing `vulnerabilities` → `[]`.
- "Sink" = `kind` in `['rds', 'sqs']` (a constant, not inline logic, so a
  future kind is a one-line addition).
- An unrecognized filter name is silently ignored rather than rejected.
- The graph looks like a partial extraction of the real architecture
  (`frontend` has one outgoing edge, `gateway-service` has none) — so the
  fully-combined query (public start + sink end + vulnerable node) legitimately
  comes back empty on this dataset. Verified, not a bug.

## Architecture

```
src/
  graph/                     pure graph library - no HTTP knowledge
    types.ts                   Graph/Node/Edge types, RouteFilter, predicate types
    loader.ts                  raw JSON -> normalized Graph (handles the data quirks above)
    store.ts                   GraphStore: node lookup + adjacency list
    predicates.ts               the extensibility point (name -> node predicate registry)
    query-engine.ts              DFS-based multi-hop route matcher
  api/
    app.ts                     express app factory (no listen(), so it's testable)
    graph/
      graph.router.ts            GET /api/graph, GET /api/graph/query
      graph.controller.ts         thin HTTP adapter: request in, service call, response out
      graph.service.ts             all business logic - builds filters, calls the engine
  server.ts                  entrypoint: load data, build store, app.listen()
test/
  predicates.test.ts         unit tests for the predicate registry
  query-engine.test.ts       unit tests for DFS route matching (incl. cycle safety)
  graph.service.test.ts      unit tests for GraphService
  graph.routes.test.ts       supertest integration tests for the HTTP layer
data/
  train-ticket.json          the provided dataset
```

`graph/predicates.ts` is the extensibility point: a `name -> (node) =>
boolean` registry. Adding a filter is one entry there — the query engine and
HTTP layer never branch on filter identity, so nothing else changes.
`graph.service.ts` holds all the request-handling business logic (building
filters, calling the engine); `graph.controller.ts` is a thin HTTP adapter.

## API reference

`GET /api/graph` — the full graph as `{ nodes, edges }`.

`GET /api/graph/query?start=<name>&end=<name>&any=<name>` — filtered
subgraph. Keys are filter position, values are predicate names; `any` is
repeatable. No filters = full graph.

| Example | Meaning |
|---|---|
| `?start=publicExposed` | routes starting at an internet-exposed service |
| `?end=sink` | routes ending at a database or queue |
| `?any=vulnerable` | routes touching a node with a known vulnerability |
| `?start=publicExposed&end=sink&any=vulnerable` | full attack path |

```bash
npm run dev   # http://localhost:3000
curl "http://localhost:3000/api/graph/query?start=publicExposed"
curl "http://localhost:3000/api/graph/query?end=sink"
curl "http://localhost:3000/api/graph/query?any=vulnerable"
```

## Running it

```bash
npm install
npm run dev     # ts-node-dev, live reload
npm test        # jest: unit tests for predicates/engine/service + supertest for the API
npm run build && npm start
```
