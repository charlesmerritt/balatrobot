// Run setup screen: deck/stake/seed selection feeding the `start` endpoint.
// This screen is UI-local — the game remains in MENU until `start` is called.

import { el } from "../components.js";
import { DECKS, STAKE_COLORS, STAKES } from "../mockdata.js";

export function render(gs, ctx) {
  const setup = ctx.ui.setup;

  const deckGrid = el("div", { class: "deck-grid" },
    DECKS.map((deck) => el("div",
      {
        class: `deck-tile${setup.deck === deck ? " selected" : ""}`,
        onclick: () => { setup.deck = deck; ctx.rerender(); },
      },
      deck,
    )),
  );

  const stakeRow = el("div", { class: "stake-row" },
    STAKES.map((stake) => el("div",
      {
        class: `stake-pip${setup.stake === stake ? " selected" : ""}`,
        style: `background:${STAKE_COLORS[stake]}`,
        title: stake,
        onclick: () => { setup.stake = stake; ctx.rerender(); },
      },
    )),
  );

  return el("div", { class: "screen-main" },
    el("div", { class: "panel" }, el("h3", {}, "Choose deck"), deckGrid),
    el("div", { class: "panel" },
      el("h3", {}, `Stake: ${setup.stake}`), stakeRow),
    el("div", { class: "panel" },
      el("h3", {}, "Seed (optional)"),
      el("input", {
        class: "seed-input", type: "text", value: setup.seed,
        placeholder: "e.g. TEST123",
        oninput: (e) => { setup.seed = e.target.value; },
      }),
    ),
    el("div", { class: "actions" },
      el("button", { class: "btn", onclick: () => { ctx.ui.showSetup = false; ctx.rerender(); } }, "Back"),
      el("button", {
        class: "btn btn-red",
        onclick: () => {
          const params = { deck: setup.deck, stake: setup.stake };
          if (setup.seed) params.seed = setup.seed;
          ctx.ui.showSetup = false;
          ctx.call("start", params);
        },
      }, "START RUN"),
    ),
  );
}
