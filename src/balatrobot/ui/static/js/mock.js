// Graph-backed mock transport. This is intentionally not a Balatro
// reimplementation: it only replays state transitions observed from a live
// game and persisted by the Python /rpc proxy.

const MOCK_ERROR_CODE = -32110;

function err(name, message) {
  const e = new Error(message);
  e.rpc = { code: MOCK_ERROR_CODE, message, data: { name } };
  throw e;
}

export class MockGame {
  constructor() {
    this.graph = null;
    this.state = null;
  }

  loadGraph(graph) {
    this.graph = normalizeGraph(graph);
    this.state = this.graph.current_state ?? firstNode(this.graph);
  }

  call(method, params = {}) {
    if (!this.hasUsableGraph()) {
      err("MOCK_GRAPH_EMPTY", "No learned gamestate graph is available for mock mode");
    }
    if (method === "gamestate") return this.gamestate();
    if (method === "rpc.discover") return this.discover();

    const edge = this.outgoing().find((candidate) => candidate.method === method);
    if (!edge) {
      err(
        "MOCK_TRANSITION_UNKNOWN",
        `No learned mock transition for '${method}' from ${this.state}`,
      );
    }
    this.state = edge.to;
    return this.gamestate({ method, params });
  }

  hasUsableGraph() {
    return Boolean(this.graph && Object.keys(this.graph.nodes).length > 0 && this.state);
  }

  outgoing() {
    return (this.graph?.edges ?? []).filter((edge) => edge.from === this.state);
  }

  gamestate(extra = {}) {
    return {
      state: this.state,
      mock: true,
      graph: {
        nodes: Object.keys(this.graph.nodes).length,
        edges: this.graph.edges.length,
        outgoing: this.outgoing().map((edge) => ({ method: edge.method, to: edge.to })),
      },
      ...extra,
    };
  }

  discover() {
    const methods = new Set(["gamestate", "rpc.discover"]);
    for (const edge of this.graph.edges) methods.add(edge.method);
    return {
      openrpc: "1.3.2",
      info: { title: "BalatroBot learned graph mock", version: "1.0.0" },
      methods: [...methods].sort().map((name) => ({
        name,
        params: [],
        result: { name: "result", schema: { type: "object" } },
      })),
    };
  }
}

function normalizeGraph(graph) {
  if (!graph || typeof graph !== "object") return emptyGraph();
  return {
    nodes: graph.nodes && typeof graph.nodes === "object" ? graph.nodes : {},
    edges: Array.isArray(graph.edges)
      ? graph.edges.filter((edge) => isEdge(edge))
      : [],
    current_state: typeof graph.current_state === "string" ? graph.current_state : null,
  };
}

function emptyGraph() {
  return { nodes: {}, edges: [], current_state: null };
}

function firstNode(graph) {
  return Object.keys(graph.nodes).sort()[0] ?? null;
}

function isEdge(edge) {
  return edge
    && typeof edge.from === "string"
    && typeof edge.to === "string"
    && typeof edge.method === "string";
}
