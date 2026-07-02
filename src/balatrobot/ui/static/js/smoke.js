// Scripted endpoint smoke test: walks a full game loop touching every
// endpoint. Each step gets the latest gamestate to build params and checks
// the outcome. Works against the mock engine or a live game.

const ok = () => true;

// step.params(gs) builds params; step.check(outcome, gsAfter) returns true,
// an error string, or "skip:<note>". outcome = {result} | {error}.
export const SMOKE_STEPS = [
  {
    label: "health", method: "health", params: () => ({}),
    check: ({ result }) => result?.status === "ok" || "expected status ok",
  },
  {
    label: "gamestate", method: "gamestate", params: () => ({}),
    check: ({ result }) => typeof result?.state === "string" || "expected state field",
  },
  {
    label: "menu (reset)", method: "menu", params: () => ({}),
    check: (_, gs) => gs.state === "MENU" || `expected MENU, got ${gs.state}`,
  },
  {
    label: "start RED/WHITE", method: "start",
    params: () => ({ deck: "RED", stake: "WHITE", seed: "SMOKE123" }),
    check: (_, gs) => gs.state === "BLIND_SELECT" || `expected BLIND_SELECT, got ${gs.state}`,
  },
  {
    label: "skip small blind", method: "skip", params: () => ({}),
    check: (_, gs) => gs.blinds?.small?.status === "SKIPPED" || "small blind not SKIPPED",
  },
  {
    label: "select big blind", method: "select", params: () => ({}),
    check: (_, gs) => gs.state === "SELECTING_HAND" || `expected SELECTING_HAND, got ${gs.state}`,
  },
  {
    label: "rearrange hand (reverse)", method: "rearrange",
    params: (gs) => ({ hand: gs.hand.cards.map((_, i) => gs.hand.cards.length - 1 - i) }),
    check: ok,
  },
  {
    label: "discard 1 card", method: "discard", params: () => ({ cards: [0] }),
    check: (_, gs) => gs.round?.discards_used >= 1 || "discards_used not incremented",
  },
  {
    label: "add joker (j_joker)", method: "add", params: () => ({ key: "j_joker" }),
    check: (_, gs) => (gs.jokers?.count ?? 0) >= 1 || "joker not added",
  },
  {
    label: "add playing card (H_A, gold seal)", method: "add",
    params: () => ({ key: "H_A", seal: "GOLD" }),
    check: ok,
  },
  {
    label: "play a hand", method: "play", params: () => ({ cards: [0, 1, 2, 3, 4] }),
    check: ok,
  },
  {
    label: "set chips to clear blind", method: "set", params: () => ({ chips: 99999999 }),
    check: ok,
    // If the played hand already beat the blind we are in ROUND_EVAL and set
    // still succeeds; the next play is skipped in that case.
  },
  {
    label: "play to trigger round win", method: "play", params: () => ({ cards: [0] }),
    skipUnless: (gs) => gs.state === "SELECTING_HAND",
    check: (_, gs) => gs.state === "ROUND_EVAL" || `expected ROUND_EVAL, got ${gs.state}`,
  },
  {
    label: "cash out", method: "cash_out", params: () => ({}),
    check: (_, gs) => gs.state === "SHOP" || `expected SHOP, got ${gs.state}`,
  },
  {
    label: "set money to $100", method: "set", params: () => ({ money: 100 }),
    check: (_, gs) => gs.money === 100 || `money is ${gs.money}`,
  },
  {
    label: "reroll shop", method: "reroll", params: () => ({}),
    check: ok,
  },
  {
    label: "buy shop card 0", method: "buy", params: () => ({ card: 0 }),
    skipUnless: (gs) => (gs.shop?.count ?? 0) > 0,
    check: ok, tolerate: ["NOT_ALLOWED"],
  },
  {
    label: "buy booster pack 0", method: "buy", params: () => ({ pack: 0 }),
    skipUnless: (gs) => (gs.packs?.count ?? 0) > 0,
    check: (_, gs) => gs.state === "SMODS_BOOSTER_OPENED" || `expected SMODS_BOOSTER_OPENED, got ${gs.state}`,
  },
  {
    label: "take pack card 0", method: "pack",
    params: (gs) => ((gs.hand?.count ?? 0) > 0 ? { card: 0, targets: [0] } : { card: 0 }),
    skipUnless: (gs) => gs.state === "SMODS_BOOSTER_OPENED",
    check: ok, tolerate: ["NOT_ALLOWED"],
  },
  {
    label: "skip pack (if still open)", method: "pack", params: () => ({ skip: true }),
    skipUnless: (gs) => gs.state === "SMODS_BOOSTER_OPENED",
    check: (_, gs) => gs.state === "SHOP" || `expected SHOP, got ${gs.state}`,
  },
  {
    label: "sell joker 0", method: "sell", params: () => ({ joker: 0 }),
    skipUnless: (gs) => (gs.jokers?.count ?? 0) > 0,
    check: ok, tolerate: ["NOT_ALLOWED"],
  },
  {
    label: "add planet (c_pluto)", method: "add", params: () => ({ key: "c_pluto" }),
    check: ok, tolerate: ["NOT_ALLOWED"],
  },
  {
    label: "use last consumable", method: "use",
    params: (gs) => ({ consumable: (gs.consumables?.count ?? 1) - 1 }),
    skipUnless: (gs) => (gs.consumables?.count ?? 0) > 0,
    check: ok, tolerate: ["NOT_ALLOWED"],
  },
  {
    label: "save run", method: "save", params: () => ({ path: "smoke_test_save.jkr" }),
    check: ({ result }) => result?.success === true || "expected success",
  },
  {
    label: "load run", method: "load", params: () => ({ path: "smoke_test_save.jkr" }),
    check: ({ result }) => result?.success === true || "expected success",
  },
  {
    label: "screenshot", method: "screenshot", params: () => ({ path: "smoke_test.png" }),
    check: ({ result }) => result?.success === true || "expected success",
  },
  {
    label: "next round", method: "next_round", params: () => ({}),
    skipUnless: (gs) => gs.state === "SHOP",
    check: (_, gs) => gs.state === "BLIND_SELECT" || `expected BLIND_SELECT, got ${gs.state}`,
  },
  {
    label: "back to menu", method: "menu", params: () => ({}),
    check: (_, gs) => gs.state === "MENU" || `expected MENU, got ${gs.state}`,
  },
];

export async function runSmoke(rpc, onStep) {
  const totals = { pass: 0, fail: 0, skip: 0 };
  for (const [i, step] of SMOKE_STEPS.entries()) {
    let gs;
    try {
      gs = await rpc.call("gamestate", {}, { silent: true });
    } catch (e) {
      onStep(i, "fail", `gamestate fetch failed: ${e.message}`);
      totals.fail += 1;
      continue;
    }
    if (step.skipUnless && !step.skipUnless(gs)) {
      onStep(i, "skip", "precondition not met");
      totals.skip += 1;
      continue;
    }
    let outcome;
    try {
      outcome = { result: await rpc.call(step.method, step.params(gs)) };
    } catch (e) {
      outcome = { error: e.rpc ?? { message: e.message, data: { name: "TRANSPORT" } } };
    }
    if (outcome.error) {
      const name = outcome.error.data?.name;
      if (step.tolerate?.includes(name)) {
        onStep(i, "pass", `tolerated ${name}`);
        totals.pass += 1;
      } else {
        onStep(i, "fail", `${name ?? "ERROR"}: ${outcome.error.message}`);
        totals.fail += 1;
      }
      continue;
    }
    const gsAfter = await rpc.call("gamestate", {}, { silent: true });
    const verdict = step.check(outcome, gsAfter);
    if (verdict === true) {
      onStep(i, "pass");
      totals.pass += 1;
    } else {
      onStep(i, "fail", String(verdict));
      totals.fail += 1;
    }
  }
  return totals;
}
