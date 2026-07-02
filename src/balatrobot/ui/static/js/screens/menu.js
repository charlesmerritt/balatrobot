// Main menu screen (game state MENU).

import { el } from "../components.js";

export function render(gs, ctx) {
  return el("div", { class: "menu-screen" },
    el("div", { class: "menu-title" },
      el("span", { class: "t1" }, "BALATRO"),
      el("span", { class: "t2" }, "BOT"),
    ),
    el("div", { class: "menu-sub" },
      "Game state: ",
      el("span", { class: "badge", "data-path": "state" }, gs.state),
      " — start a run to walk the screens. Every element is bound to its ",
      "gamestate path (hover anything, watch the inspector).",
    ),
    el("div", { class: "actions" },
      el("button", { class: "btn btn-red", onclick: () => { ctx.ui.showSetup = true; ctx.rerender(); } }, "PLAY"),
      el("button", { class: "btn", onclick: () => ctx.call("health", {}) }, "Health Check"),
    ),
  );
}
