// Shared DOM helpers and card renderers. Every rendered element that maps to
// a gamestate value carries a data-path attribute (dot-separated, 0-based
// array indices) that the inspector uses for two-way highlighting.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

const SUIT_GLYPHS = { Hearts: "♥", Diamonds: "♦", Spades: "♠", Clubs: "♣" };
const SEAL_COLORS = { RED: "#fe5f55", BLUE: "#0099ff", GOLD: "#eac058", PURPLE: "#8e5fca" };
const EDITION_COLORS = { FOIL: "#9ecbff", HOLO: "#ff9ef4", POLYCHROME: "#b7ff9e", NEGATIVE: "#333" };

// Renders a playing card. `path` is the gamestate path of the card object.
export function playingCard(card, path, { selected = false, onclick } = {}) {
  const suit = card.value?.suit ?? "Spades";
  const rank = card.value?.rank ?? "?";
  const mods = [];
  if (card.modifier?.seal) mods.push(dot(SEAL_COLORS[card.modifier.seal], `${card.modifier.seal} seal`));
  if (card.modifier?.edition) mods.push(dot(EDITION_COLORS[card.modifier.edition], card.modifier.edition));
  if (card.modifier?.enhancement) mods.push(dot("#4bc292", card.modifier.enhancement));

  const classes = ["pcard"];
  if (selected) classes.push("selected");
  if (card.state?.debuff) classes.push("debuffed");
  if (card.state?.hidden) classes.push("facedown");

  return el("div",
    {
      class: classes.join(" "),
      "data-path": path,
      title: `${card.label} — ${card.value?.effect ?? ""} [${path}]`,
      onclick,
    },
    el("div", { class: `corner suit-${suit}` }, rank, el("br"), SUIT_GLYPHS[suit] ?? ""),
    el("div", { class: `pip suit-${suit}` }, SUIT_GLYPHS[suit] ?? ""),
    el("div", { class: "mods" }, mods),
  );
}

function dot(color, title) {
  return el("span", { class: "mod-dot", style: `background:${color}`, title });
}

// Renders a joker / consumable / voucher / booster card.
export function specialCard(card, path, { selected = false, onclick, showCost = false } = {}) {
  if (card.set === "Default" || card.set === "Enhanced" || card.value?.suit) {
    const node = playingCard(card, path, { selected, onclick });
    if (showCost) node.append(el("div", { class: "scard-cost" }, `$${card.cost?.buy ?? 0}`));
    return node;
  }
  const classes = ["scard", `set-${card.set ?? "Default"}`];
  if (selected) classes.push("selected");
  return el("div",
    {
      class: classes.join(" "),
      "data-path": path,
      title: `${card.label} (${card.key}) [${path}]`,
      onclick,
    },
    el("div", { class: "scard-name" }, card.label ?? card.key),
    el("div", { class: "scard-effect" }, card.value?.effect ?? ""),
    showCost ? el("div", { class: "scard-cost" }, `$${card.cost?.buy ?? 0}`) : null,
  );
}

// Renders an Area (types.lua) as a labelled row of cards.
export function areaRow(area, basePath, label, renderCard) {
  const cards = area?.cards ?? [];
  return el("div", { class: "panel", "data-path": basePath },
    el("div", { class: "area-label" },
      `${label} `,
      el("span", { class: "badge", "data-path": `${basePath}.count` }, `${area?.count ?? 0}/${area?.limit ?? "-"}`),
    ),
    el("div", { class: "card-row" },
      cards.map((card, i) => renderCard(card, `${basePath}.cards.${i}`, i)),
    ),
  );
}

export function statLine(label, value, path, cls = "") {
  return el("div", { class: "stat-line", "data-path": path },
    el("span", { class: "label" }, label),
    el("span", { class: `value ${cls}` }, String(value)),
  );
}

export function toast(message, kind = "error") {
  const box = document.getElementById("toasts");
  const node = el("div", { class: `toast ${kind}` }, message);
  box.append(node);
  setTimeout(() => node.remove(), 4200);
}
