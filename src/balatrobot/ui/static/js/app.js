// App orchestrator: transport mode, gamestate polling, screen routing, and
// the two-way path-highlight wiring between screen and inspector.

import { el, toast } from "./components.js";
import { Inspector } from "./inspector.js";
import { Rpc } from "./rpc.js";
import * as blinds from "./screens/blinds.js";
import * as gameover from "./screens/gameover.js";
import * as menu from "./screens/menu.js";
import * as pack from "./screens/pack.js";
import * as play from "./screens/play.js";
import * as roundeval from "./screens/roundeval.js";
import * as setup from "./screens/setup.js";
import * as shop from "./screens/shop.js";

const SCREENS = {
  MENU: menu,
  BLIND_SELECT: blinds,
  SELECTING_HAND: play,
  ROUND_EVAL: roundeval,
  SHOP: shop,
  SMODS_BOOSTER_OPENED: pack,
  GAME_OVER: gameover,
};

const POLL_MS = 1500;

const rpc = new Rpc();
const screenBox = document.getElementById("screen");
const stateBadge = document.getElementById("state-badge");
const connStatus = document.getElementById("conn-status");
const modeSelect = document.getElementById("mode-select");

let lastGs = { state: "MENU", round_num: 0, ante_num: 0, money: 0 };
let lastHandIds = "";

const ctx = {
  ui: {
    selected: new Set(),
    setup: { deck: "RED", stake: "WHITE", seed: "" },
    showSetup: false,
    packChoice: null,
  },
  // Call an endpoint, toast errors, then refresh the gamestate and re-render.
  async call(method, params) {
    try {
      const result = await rpc.call(method, params);
      await refresh();
      return result;
    } catch (e) {
      const name = e.rpc?.data?.name;
      toast(`${method}: ${e.rpc?.message ?? e.message}`,
        name === "INVALID_STATE" || name === "NOT_ALLOWED" ? "warn" : "error");
      await refresh();
      throw e;
    }
  },
  refresh: () => refresh(),
  rerender: () => render(),
};

const inspector = new Inspector(rpc, ctx);
inspector.initTreeHover(screenBox);

async function refresh() {
  try {
    lastGs = await rpc.call("gamestate", {}, { silent: true });
    connStatus.className = "conn-status ok";
    connStatus.title = rpc.mode === "mock" ? "Mock engine" : "Connected to game server";
  } catch (e) {
    connStatus.className = "conn-status bad";
    connStatus.title = `Cannot reach game server: ${e.rpc?.message ?? e.message}`;
    render();
    return;
  }
  // Reset card selection when the hand composition changes.
  const handIds = (lastGs.hand?.cards ?? []).map((c) => c.id).join(",");
  if (handIds !== lastHandIds) {
    lastHandIds = handIds;
    ctx.ui.selected.clear();
  }
  render();
}

function render() {
  const gs = lastGs;
  stateBadge.textContent = gs.state ?? "?";
  const module =
    gs.state === "MENU" && ctx.ui.showSetup ? setup : SCREENS[gs.state];
  screenBox.replaceChildren(
    module
      ? module.render(gs, ctx)
      : el("div", { class: "menu-screen" },
          el("div", { class: "panel" },
            `No dedicated screen for state `,
            el("span", { class: "badge", "data-path": "state" }, gs.state ?? "unknown"),
            ` — inspect the raw gamestate on the right.`),
        ),
  );
  inspector.updateGamestate(gs);
}

// Screen → inspector hover highlighting.
screenBox.addEventListener("mouseover", (e) => {
  const node = e.target.closest("[data-path]");
  if (node) inspector.highlight(node.dataset.path);
});
screenBox.addEventListener("mouseout", () => inspector.highlight(null));

// Mode toggle, refresh button, polling.
modeSelect.value = rpc.mode;
modeSelect.addEventListener("change", () => {
  rpc.setMode(modeSelect.value);
  inspector.initConsole();
  refresh();
});
document.getElementById("refresh-btn").addEventListener("click", refresh);

setInterval(() => {
  if (rpc.mode === "live") refresh();
}, POLL_MS);

// Scripting hook for automation and debugging (e.g. driving the UI from a
// bot or a browser test): window.__bbviz.ctx.call("start", {...}).
window.__bbviz = { rpc, ctx, refresh };

refresh();
