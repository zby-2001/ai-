const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));
  return match ? match[1] : "";
}

function testRecipeCardOverridesGlobalButtonStyle() {
  const rule = getRule(".recipe-card");
  assert.match(rule, /width:\s*100%/);
  assert.match(rule, /color:\s*#1f2933/);
}

testRecipeCardOverridesGlobalButtonStyle();

console.log("style.test.js passed");
