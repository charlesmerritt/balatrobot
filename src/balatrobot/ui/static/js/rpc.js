// JSON-RPC transport: "live" posts to the /rpc proxy, "mock" runs the
// in-browser engine. Every call is recorded in a log that inspector views
// subscribe to.

import { MockGame } from "./mock.js";

export class Rpc {
  constructor() {
    this.mode = localStorage.getItem("bbviz-mode") ?? "mock";
    this.mock = new MockGame();
    this.nextId = 1;
    this.log = [];
    this.listeners = new Set();
  }

  setMode(mode) {
    this.mode = mode;
    localStorage.setItem("bbviz-mode", mode);
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

  async callLive(method, params) {
    const response = await fetch("/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
