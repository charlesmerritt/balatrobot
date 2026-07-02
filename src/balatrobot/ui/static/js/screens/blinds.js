// Blind select screen (game state BLIND_SELECT). Binds each column to
// gamestate.blinds.{small,big,boss}; Select/Skip act on the on-deck blind.

import { el } from "../components.js";

export function render(gs, ctx) {
  const columns = ["small", "big", "boss"].map((key) => {
    const blind = gs.blinds?.[key];
    if (!blind) return null;
    const path = `blinds.${key}`;
    const onDeck = blind.status === "SELECT" || blind.status === "CURRENT";
    const done = blind.status === "DEFEATED" || blind.status === "SKIPPED";

    return el("div", { class: `blind-col${onDeck ? " current" : ""}${done ? " dimmed" : ""}`, "data-path": path },
      el("div", { class: "blind-status", "data-path": `${path}.status` }, blind.status),
      el("div", { class: `blind-disc blind-${blind.type === "BOSS" ? "Boss" : blind.type === "BIG" ? "Big" : "Small"}` }),
      el("div", { class: "blind-name", "data-path": `${path}.name` }, blind.name),
      el("div", { class: "blind-score", "data-path": `${path}.score` }, `Score: ${blind.score}`),
      el("div", { class: "blind-effect", "data-path": `${path}.effect` }, blind.effect || " "),
      blind.tag_name
        ? el("div", { class: "tag-box", "data-path": `${path}.tag_name` },
            `Skip tag: ${blind.tag_name}`, el("br"), el("span", { class: "muted" }, blind.tag_effect ?? ""))
        : null,
      onDeck
        ? el("div", { class: "actions" },
            el("button", { class: "btn btn-red", onclick: () => ctx.call("select", {}) }, "Select"),
            blind.type !== "BOSS"
              ? el("button", { class: "btn btn-orange", onclick: () => ctx.call("skip", {}) }, "Skip")
              : null,
          )
        : null,
    );
  });

  return el("div", { class: "screen-main" },
    el("div", { class: "panel" },
      el("h3", {}, "Choose your next blind"),
      el("span", { class: "badge", "data-path": "ante_num" }, `Ante ${gs.ante_num}`),
      " ",
      el("span", { class: "badge", "data-path": "money" }, `$${gs.money}`),
    ),
    el("div", { class: "blind-columns" }, columns),
  );
}
