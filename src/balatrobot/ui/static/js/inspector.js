// Inspector panel: gamestate JSON tree with two-way path highlighting,
// JSON-RPC log, endpoint console (forms from rpc.discover), smoke test tab.

import { el } from "./components.js";
import { runSmoke, SMOKE_STEPS } from "./smoke.js";

export class Inspector {
  constructor(rpc, ctx) {
    this.rpc = rpc;
    this.ctx = ctx;
    this.treeBox = document.getElementById("tab-gamestate");
    this.logBox = document.getElementById("tab-log");
    this.consoleBox = document.getElementById("tab-console");
    this.smokeBox = document.getElementById("tab-smoke");
    this.pathStrip = document.getElementById("path-strip");

    this.initTabs();
    this.initLog();
    this.initSmoke();
  }

  initTabs() {
    const tabs = document.querySelectorAll("#inspector-tabs .tab");
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab, .tab-panel").forEach((n) => n.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
      });
    }
  }

  // ---- gamestate tree -------------------------------------------------------

  updateGamestate(gs) {
    const openPaths = new Set(
      [...this.treeBox.querySelectorAll("details[open]")].map((d) => d.dataset.jsonPath),
    );
    if (openPaths.size === 0) openPaths.add(""); // root open by default
    this.treeBox.replaceChildren(
      el("div", { class: "json-tree" }, this.buildNode("", "gamestate", gs, openPaths)),
    );
  }

  buildNode(path, key, value, openPaths) {
    const isObj = value !== null && typeof value === "object";
    if (!isObj) {
      const cls = value === null ? "json-null"
        : typeof value === "string" ? "json-str"
        : typeof value === "number" ? "json-num" : "json-bool";
      return el("div", { class: "json-node", "data-json-path": path },
        el("span", { class: "json-key" }, `${key}: `),
        el("span", { class: cls }, JSON.stringify(value)),
      );
    }
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value);
    const hint = Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`;
    const details = el("details", { "data-json-path": path },
      el("summary", { "data-json-path": path }, `${key} ${hint}`),
      entries.map(([k, v]) => this.buildNode(path ? `${path}.${k}` : k, k, v, openPaths)),
    );
    if (openPaths.has(path)) details.setAttribute("open", "");
    return details;
  }

  // Highlight the JSON node for a screen element's data-path (and show it in
  // the strip). Called from app.js hover delegation.
  highlight(path) {
    this.pathStrip.textContent = path ? `gamestate.${path}` : " ";
    for (const node of this.treeBox.querySelectorAll(".path-hl")) node.classList.remove("path-hl");
    if (!path) return;
    const target = this.treeBox.querySelector(
      `[data-json-path="${CSS.escape(path)}"]`);
    if (target) {
      // Open ancestors so the highlight is visible.
      let parent = target.parentElement;
      while (parent && parent !== this.treeBox) {
        if (parent.tagName === "DETAILS") parent.setAttribute("open", "");
        parent = parent.parentElement;
      }
      (target.tagName === "DETAILS" ? target.querySelector("summary") : target)
        .classList.add("path-hl");
      target.scrollIntoView({ block: "nearest" });
    }
  }

  // Reverse direction: hovering a JSON node highlights screen elements.
  initTreeHover(screenBox) {
    this.treeBox.addEventListener("mouseover", (e) => {
      const node = e.target.closest("[data-json-path]");
      if (!node) return;
      const path = node.dataset.jsonPath;
      this.pathStrip.textContent = path ? `gamestate.${path}` : " ";
      for (const n of screenBox.querySelectorAll(".path-hl")) n.classList.remove("path-hl");
      if (!path) return;
      for (const n of screenBox.querySelectorAll("[data-path]")) {
        if (n.dataset.path === path) n.classList.add("path-hl");
      }
    });
    this.treeBox.addEventListener("mouseout", () => {
      for (const n of screenBox.querySelectorAll(".path-hl")) n.classList.remove("path-hl");
    });
  }

  // ---- log ------------------------------------------------------------------

  initLog() {
    this.rpc.onLog((entry) => this.logBox.prepend(this.logEntry(entry)));
  }

  logEntry(entry) {
    const kind = entry.error
      ? (entry.error.data?.name === "INVALID_STATE" ? "log-warn" : "log-err")
      : "log-ok";
    const detail = el("div", { class: "log-detail", style: "display:none" },
      JSON.stringify({ params: entry.params, ...(entry.error ? { error: entry.error } : { result: entry.result }) }, null, 1),
    );
    const head = el("div", { class: "log-head", onclick: () => {
      detail.style.display = detail.style.display === "none" ? "block" : "none";
    } },
      el("span", { class: "log-method" }, entry.method),
      el("span", { class: "muted" }, entry.error ? (entry.error.data?.name ?? "ERROR") : "ok"),
      el("span", { class: "log-ms" }, `${entry.mode} · ${entry.ms}ms`),
    );
    return el("div", { class: `log-entry ${kind}` }, head, detail);
  }

  // ---- console ----------------------------------------------------------------

  async initConsole() {
    this.consoleBox.replaceChildren(el("div", { class: "muted" }, "Loading method list…"));
    try {
      const spec = await this.rpc.call("rpc.discover", {});
      this.buildConsole(spec.methods.filter((m) => m.name !== "rpc.discover"));
    } catch (e) {
      this.consoleBox.replaceChildren(
        el("div", {}, `Could not load method list (${e.message}). `,
          el("button", { class: "btn btn-small", onclick: () => this.initConsole() }, "Retry")),
      );
    }
  }

  buildConsole(methods) {
    const result = el("div", { class: "console-result" }, "—");
    const paramsBox = el("div", {});
    const select = el("select", {},
      methods.map((m) => el("option", { value: m.name }, m.name)));

    const renderParams = () => {
      const method = methods.find((m) => m.name === select.value);
      paramsBox.replaceChildren(
        (method.params ?? []).map((p) => el("label", {},
          `${p.name}${p.required ? " *" : ""} `,
          el("span", { class: "param-hint" }, `(${p.schema?.type ?? "?"}) ${p.description ?? ""}`),
          el("input", { type: "text", "data-param": p.name, "data-type": p.schema?.type ?? "string" }),
        )),
      );
    };
    select.addEventListener("change", renderParams);

    const send = async () => {
      const params = {};
      for (const input of paramsBox.querySelectorAll("input[data-param]")) {
        const raw = input.value.trim();
        if (raw === "") continue;
        const type = input.dataset.type;
        try {
          params[input.dataset.param] =
            type === "integer" ? parseInt(raw, 10)
            : type === "boolean" ? raw === "true"
            : type === "array" ? (raw.startsWith("[") ? JSON.parse(raw) : raw.split(",").map((s) => parseInt(s.trim(), 10)))
            : raw;
        } catch {
          result.textContent = `Cannot parse parameter '${input.dataset.param}': ${raw}`;
          return;
        }
      }
      try {
        const res = await this.ctx.call(select.value, params);
        result.textContent = JSON.stringify(res, null, 1);
      } catch (e) {
        result.textContent = JSON.stringify(e.rpc ?? { message: e.message }, null, 1);
      }
    };

    this.consoleBox.replaceChildren(
      el("div", { class: "console-form" },
        el("label", {}, "Method", select),
        paramsBox,
        el("button", { class: "btn btn-green", onclick: send }, "Send"),
        el("div", { class: "param-hint" }, "Arrays: comma-separated (0,1,2) or JSON. Booleans: true/false. Empty fields are omitted."),
        result,
      ),
    );
    renderParams();
  }

  // ---- smoke test ----------------------------------------------------------

  initSmoke() {
    const table = el("table", { class: "smoke-table" },
      SMOKE_STEPS.map((step, i) => el("tr", { id: `smoke-row-${i}` },
        el("td", {}, String(i + 1)),
        el("td", {}, step.label),
        el("td", { class: "smoke-status muted" }, "—"),
      )),
    );
    const summary = el("div", { class: "smoke-summary" }, "Exercises every endpoint in a full game loop.");
    const button = el("button", {
      class: "btn btn-red",
      onclick: async () => {
        button.disabled = true;
        summary.textContent = "Running…";
        const outcome = await runSmoke(this.rpc, (i, status, note) => {
          const cell = table.querySelector(`#smoke-row-${i} .smoke-status`);
          cell.className = `smoke-status smoke-${status}`;
          cell.textContent = status.toUpperCase() + (note ? ` — ${note}` : "");
        });
        summary.textContent =
          `${outcome.pass} passed, ${outcome.fail} failed, ${outcome.skip} skipped (mode: ${this.rpc.mode})`;
        button.disabled = false;
        this.ctx.refresh();
      },
    }, "Run Smoke Test");
    this.smokeBox.replaceChildren(
      el("div", { class: "param-hint" },
        "Runs a scripted sequence through every endpoint (menu → start → blinds → play → shop → pack → …). ",
        "In live mode this drives the real game."),
      el("div", { class: "actions" }, button),
      summary,
      table,
    );
  }
}
