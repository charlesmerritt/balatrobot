// JSON-RPC transports: "live" posts to the game proxy, "mock" runs the
// learned graph in-browser, and "fixture" calls the offline contract fixture.
// Every call is recorded in a log that inspector views subscribe to.

import { MockGame } from "./mock.js";

export class Rpc {
  constructor() {
    this.mode = "live";
    this.mock = new MockGame();
    this.fixtureStates = [];
    this.fixtureState = "MENU";
    this.nextId = 1;
    this.log = [];
    this.listeners = new Set();
  }

  async init() {
    let config = { initialMode: "live", graphUrl: "/state-graph.json" };
    try {
      const response = await fetch("/config.json");
      config = await response.json();
    } catch {
      // Older/static hosts default to live and an empty mock graph.
    }
    this.mode = config.initialMode ?? "live";
    try {
      const graphResponse = await fetch(config.graphUrl ?? "/state-graph.json");
      this.mock.loadGraph(await graphResponse.json());
    } catch {
      this.mock.loadGraph(null);
    }
    try {
      const fixtureResponse = await fetch("/fixtures/gamestates.json");
      const fixtureDocument = await fixtureResponse.json();
      this.fixtureStates = Object.keys(fixtureDocument.states ?? {});
      this.fixtureState = this.fixtureStates.includes("MENU")
        ? "MENU"
        : this.fixtureStates[0];
    } catch {
      this.fixtureStates = [];
    }
  }

  setMode(mode) {
    this.mode = mode;
  }

  setFixtureState(state) {
    if (this.fixtureStates.includes(state)) this.fixtureState = state;
  }

  onLog(fn) { this.listeners.add(fn); }

  record(entry) {
    this.log.push(entry);
    if (this.log.length > 300) this.log.shift();
    for (const fn of this.listeners) fn(entry);
  }

  // Returns the JSON-RPC result. Throws an Error with `.rpc` set to the
  // JSON-RPC error object on failure. `silent` skips log recording (used by
  // background gamestate polling to keep the log readable).
  async call(method, params = {}, { silent = false } = {}) {
    const started = performance.now();
    const entry = { method, params, at: new Date(), mode: this.mode };
    try {
      const result = this.mode === "mock"
        ? await this.callMock(method, params)
        : this.mode === "fixture"
          ? await this.callFixture(method, params)
          : await this.callLive(method, params);
      entry.result = result;
      entry.ms = Math.round(performance.now() - started);
      if (!silent) this.record(entry);
      return result;
    } catch (e) {
      entry.error = e.rpc ?? { code: null, message: e.message, data: { name: "TRANSPORT" } };
      entry.ms = Math.round(performance.now() - started);
      if (!silent) this.record(entry);
      throw e;
    }
  }

  async callMock(method, params) {
    // Yield to the event loop so mock behaves async like live mode.
    await Promise.resolve();
    return this.mock.call(method, params);
  }

  async callFixture(method, params) {
    return this.callHttp("/fixture-rpc", method, params, {
      "X-Balatrobot-Fixture-State": this.fixtureState,
    });
  }

  async callLive(method, params) {
    return this.callHttp("/rpc", method, params);
  }

  async callHttp(endpoint, method, params, headers = {}) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: this.nextId++ }),
    });
    const data = await response.json();
    if (data.error) {
      const e = new Error(data.error.message);
      e.rpc = data.error;
      throw e;
    }
    return data.result;
  }
}
