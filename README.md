# Train Ticket Graph API

A small REST API over the Train Ticket microservices dependency graph, with a
generic, extensible filter engine for querying it.

## The task, in one sentence

Load the provided JSON graph and expose it through an API that can return
either the whole graph or a filtered subgraph, where "filtered" means
selecting **routes** (chains of service calls) that start at a public-facing
service, end at a data/message sink, and/or touch a node with a known
vulnerability — with the filter mechanism built so new criteria can be added
without touching the query engine.

## Key design decision: what is a "route"?

The spec says: *"filter the routes between the services, based on: routes
that start in a public service, routes that end in a sink, routes that have
a vulnerability in one of the nodes."*

This is ambiguous between two readings:

- **Single edge** — a route is one direct `A → B` call. Filters check that
  edge's two endpoints directly.
- **Multi-hop path** — a route is a full chain `A → B → C → ... → Z` through
  the graph. Filters check the chain's first node, last node, and every node
  along the way.

**I went with multi-hop paths.** Reasons:

1. It's a strict generalization — a single edge is just a path of length 1,
   so nothing expressible under the "single edge" reading is lost.
2. "a vulnerability in **one of the nodes**" (plural) reads far more
   naturally for a multi-node chain than for one edge's two endpoints.
3. It's the only reading under which combining filters with AND is
   meaningful. Under the single-edge reading, "starts public AND ends in a
   sink" requires *one edge* that is simultaneously from a public node and
   to a database — which structurally never happens in a layered service
   architecture (public entry points are never a database's direct caller).
   That would make the "build filters so they compose" requirement pointless
   to demonstrate. Under multi-hop, the same query answers a real question:
   "is there a path from an internet-facing service, through a vulnerable
   node, down to a database?" — i.e. an attack path / blast-radius query,
   which is the kind of thing this graph shape is actually useful for.

Concretely, a route matches a set of filters if:
- every `start` filter passes on the route's first node,
- every `end` filter passes on the route's last node,
- every `any` filter is satisfied by *some* node somewhere on the route
  (not necessarily the same node for each filter).

## Response shape: one merged subgraph, not a list of paths

When multiple routes match a query, the API returns the **union** of every
node and edge that appears on any matching route, as a single
`{ nodes, edges }` graph — not an array of individual path arrays. This is
what the spec asks for directly ("the API should return a graph structure,
that can be easy to render in a client side application") and it's the shape
that's directly consumable by graph-rendering libraries (Cytoscape.js,
react-flow, vis-network, etc.) without extra client-side reshaping.

The tradeoff: you lose the ability to distinguish "these three nodes were on
the same path" from "these three nodes each showed up on a different path."
For a security-graph use case (which filter matched, what's exposed) the
union is the more useful shape; if a future requirement needs individual
path identity, `findMatchingSubgraph` could be extended to also return the
raw path list alongside the merged view.

## Architecture

```
src/
  graph/
    types.ts          Graph/Node/Edge types, RouteFilter, predicate types
    loader.ts          raw JSON -> normalized Graph (see "data assumptions" below)
    store.ts            GraphStore: node lookup + adjacency list
    predicates.ts        the extensibility point (see below)
    query-engine.ts       DFS-based multi-hop route matcher
  api/
    app.ts               express app factory (no listen(), so it's testable)
    graph/
      graph.router.ts       GET /api/graph, GET /api/graph/query
      graph.controller.ts    thin HTTP adapter: request in, service call, response out
      graph.service.ts       all business logic - builds RouteFilter[], validates
                              filter names, delegates to the query engine
  server.ts              entrypoint: load data, build store, app.listen()
test/                   unit tests (predicates, query engine, service) + supertest API tests
data/train-ticket.json  the provided dataset
```

The layering is deliberate:
- `graph/*` is a pure library over an in-memory graph with zero knowledge of HTTP.
- `api/graph/graph.service.ts` owns all the business logic - turning raw
  filter params into `RouteFilter[]` (dropping any name that isn't in the
  predicate registry), deciding "no filters = full graph", calling the
  query engine.
- `api/graph/graph.controller.ts` is deliberately thin: it only shuttles
  data between Express's `req`/`res` and the service, with no graph or
  filter logic of its own.

That separation is what makes each layer independently unit-testable: the
query engine is tested with no HTTP or Express involved, the service is
tested with no HTTP involved, and the routes test is the only layer that
goes through actual HTTP via supertest.

### The extensibility point: the predicate registry

`src/graph/predicates.ts` holds a single map:

```ts
export const predicateRegistry: Record<string, PredicateFactory> = {
  publicExposed: () => (node) => node.publicExposed === true,
  sink:          () => (node) => SINK_KINDS.includes(node.kind),
  vulnerable:    (params) => (node) =>
    (node.vulnerabilities ?? []).some(v => !params?.severity || v.severity === params.severity),
  kind:          (params) => (node) => node.kind === params?.kind,
  language:      (params) => (node) => node.language === params?.language,
};
```

Every filter the API can apply — at any position (`start` / `end` / `any`) —
is just a `(node) => boolean` looked up by name from this map. The query
engine and the HTTP layer never branch on filter identity; they just call
whatever predicate they were handed. Concretely, this means:

- **Adding a new filter** (e.g. "language = java") is one new entry in this
  map. Nothing else changes — the query engine doesn't know or care that a
  new filter exists, and the HTTP layer automatically accepts the new name.
- The three filters the spec requires (`publicExposed`, `sink`, `vulnerable`)
  are not special-cased anywhere; they're just the three entries that happen
  to be pre-registered. `kind` and `language` are included as a concrete
  demonstration that a 4th/5th filter really is a one-line addition.

## API reference

### `GET /api/graph`
Returns the full graph.
```json
{ "nodes": [ { "name": "frontend", "kind": "service", "publicExposed": true, ... } ],
  "edges": [ { "from": "frontend", "to": "admin-basic-info-service" } ] }
```

### `GET /api/graph/query`
Returns a filtered subgraph. Query keys are the filter **position**; values
are predicate names from the registry above. `any` is repeatable (each
occurrence is AND-ed in, same as `start`/`end` would be if repeated).

| Example | Meaning |
|---|---|
| `?start=publicExposed` | routes starting at an internet-exposed service |
| `?end=sink` | routes ending at a database or queue |
| `?any=vulnerable` | routes that pass through a node with a known vulnerability |
| `?start=publicExposed&end=sink&any=vulnerable` | full attack path: public entry → vulnerable node → data sink |
| `?any=vulnerable&any=publicExposed` | routes that touch *both* a vulnerable node and a public node (order doesn't matter) |

No filters supplied → same response as `GET /api/graph`.
An unknown filter name (e.g. a typo) is silently ignored rather than
rejected — it just doesn't narrow the result, so `?any=bogus` behaves like
no filter was passed at all, and `?start=publicExposed&any=bogus` behaves
like only `start=publicExposed` was passed.

### Try it

```bash
npm run dev   # server on http://localhost:3000

curl http://localhost:3000/api/graph

curl "http://localhost:3000/api/graph/query?start=publicExposed"
curl "http://localhost:3000/api/graph/query?end=sink"
curl "http://localhost:3000/api/graph/query?any=vulnerable"

# full attack path: public entry -> vulnerable node -> data sink
curl "http://localhost:3000/api/graph/query?start=publicExposed&end=sink&any=vulnerable"

# unknown filter name -> ignored, same response as /api/graph
curl "http://localhost:3000/api/graph/query?any=notarealfilter"
```

### Verified against the real dataset
- `?start=publicExposed` → 7 nodes / 6 edges (everything reachable from `frontend`)
- `?end=sink` → 22 nodes / includes `prod-postgresdb`, `prod-sqs`
- `?any=vulnerable` → 23 nodes (everything reachable to/from `auth-service` and `order-service`, which carry the dataset's two `vulnerabilities` entries)
- `?start=publicExposed&end=sink&any=vulnerable` → **empty**. This is correct, not a bug — see "data assumptions" below.

## Data assumptions

- **`edges[].to` is inconsistently typed** in the source file — usually an
  array, but a single edge (`consign-service`) has it as a bare string. The
  loader normalizes both into flat `{from, to}` pairs.
- **`assurance-service` is referenced by two edges but never declared as a
  node.** Rather than drop those edges (which would silently corrupt the
  graph a client renders) or crash, the loader synthesizes a placeholder
  node (`kind: "unknown"`) for any edge endpoint that isn't a declared node,
  so every edge always resolves to a real node on both ends.
- **`publicExposed` missing → treated as `false`**, **`vulnerabilities`
  missing → treated as `[]`.** Only `frontend` and `gateway-service` are
  actually public in the data.
- **"Sink" = `kind` in `['rds', 'sqs']`.** The spec says "rds/sql"; the
  dataset's only non-`service` kinds are `rds` and `sqs`, and both represent
  something a request's data flow terminates into, so I treated both as
  sinks. This is a constant, not inline logic, specifically so a future kind
  (`s3`, `kafka`, ...) is a one-line addition.
- **The provided graph looks like a partial extraction** of the real Train
  Ticket architecture, not the full call graph: `frontend` has exactly one
  outgoing edge and `gateway-service` has none at all, even though in the
  real system the gateway fronts nearly every service. Because of this, the
  fully-combined query (public start + sink end + vulnerable node) comes
  back empty against this dataset — `frontend`'s only reachable branch
  (through `admin-basic-info-service`) never reaches a database. That's a
  property of the sample data, verified above, not an engine bug.

## Complexity note

Route matching is a DFS over the adjacency list with a per-path visited-set
(so it explores simple paths only — no infinite loops on cycles). This is
brute-force path enumeration: worst case exponential in a densely-connected
graph. For this dataset (~50 nodes, shallow layered fan-out) it's instant.
For a much larger or denser graph, the next step would be memoizing on
`(node, satisfied-any-filters-bitmask)` or capping traversal depth.

## Running it

```bash
npm install
npm run dev     # ts-node-dev, live reload, http://localhost:3000
npm test        # jest: unit tests for predicates, query engine and service, supertest for the API
npm run build && npm start   # compiled build
```

## What I'd add with more time

- Query params for predicate arguments over HTTP (the registry already
  supports parameterized predicates like `vulnerable(severity)`, but the
  HTTP layer only wires up the bare name — extending the query string
  parsing to `any=vulnerable:severity=high` would take this the rest of the
  way).
- OpenAPI/Swagger doc and a Dockerfile — skipped to stay inside the time box
  for this exercise, not because they'd be hard.
- An explicit "list of individual paths" response mode alongside the merged
  subgraph, for clients that want per-path identity.
