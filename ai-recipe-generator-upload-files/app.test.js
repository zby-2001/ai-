const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildRecipeRequest,
  formatRecipeForCopy,
  getGenerateButtonText,
  getFriendlyErrorMessage,
  getMockRecipes,
  addHistoryEntry,
  addFavoriteEntry,
  normalizeRecipeResponse,
  validateIngredients
} = require("./app.js");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

function testEmptyIngredientsShowsMessage() {
  const result = validateIngredients("");
  assert.equal(result, "请先输入至少一种食材。");
}

function testGeneratorReturnsThreeRecipes() {
  const recipes = getMockRecipes("鸡蛋、番茄、米饭、青菜", "快手、少油、不辣");
  assert.equal(recipes.length, 3);
  assert.equal(recipes[0].name, "番茄鸡蛋盖饭");
  assert.ok(recipes[0].steps.length > 0);
  assert.ok(recipes[0].reason.includes("鸡蛋、番茄、米饭、青菜"));
}

function testFriendlyErrorForInvalidAiShape() {
  const message = getFriendlyErrorMessage(new Error("第 1 个菜谱缺少 steps。"));
  assert.equal(message, "这次 AI 返回的菜谱格式不完整，请再生成一次。");
}

function testFriendlyErrorForNetworkIssue() {
  const message = getFriendlyErrorMessage(new Error("无法连接 DeepSeek API，请检查网络或代理。"));
  assert.equal(message, "无法连接 DeepSeek API，请检查网络或代理。");
}

function testGenerateButtonTextReflectsLoading() {
  assert.equal(getGenerateButtonText(true), "正在问 AI...");
  assert.equal(getGenerateButtonText(false), "生成 3 个菜谱");
}

function testNormalizeRecipeResponseKeepsDebugPrompt() {
  const recipes = getMockRecipes("鸡蛋", "不辣");
  const response = normalizeRecipeResponse({
    recipes,
    debug: {
      prompt: {
        model: "deepseek-v4-flash",
        system: "system prompt",
        user: "user prompt"
      }
    }
  });

  assert.equal(response.recipes.length, 3);
  assert.equal(response.debug.prompt.user, "user prompt");
}

function testGenerateClickDoesNotPassEventAsRequest() {
  assert.ok(appSource.includes('generateBtn.addEventListener("click", () => generateRecipes());'));
}

function testBuildRecipeRequestIncludesNewFields() {
  const request = buildRecipeRequest({
    ingredients: "鸡蛋",
    preferences: "不辣",
    servings: "2 人",
    avoidances: "香菜",
    maxTime: "20 分钟内"
  });

  assert.deepEqual(request, {
    ingredients: "鸡蛋",
    preferences: "不辣",
    servings: "2 人",
    avoidances: "香菜",
    maxTime: "20 分钟内"
  });
}

function testFormatRecipeForCopy() {
  const text = formatRecipeForCopy({
    name: "番茄鸡蛋盖饭",
    time: "15 分钟",
    difficulty: "简单",
    reason: "适合已有食材。",
    ingredients: ["鸡蛋", "番茄"],
    steps: ["炒鸡蛋", "炒番茄"],
    substitutions: ["米饭可以换面条"],
    tips: ["少油也好吃"]
  });

  assert.ok(text.includes("番茄鸡蛋盖饭"));
  assert.ok(text.includes("所需食材"));
  assert.ok(text.includes("1. 炒鸡蛋"));
  assert.ok(text.includes("替换建议"));
  assert.ok(text.includes("小贴士"));
}

function testAddHistoryEntryKeepsLatestFive() {
  const recipes = getMockRecipes("鸡蛋", "不辣");
  const existingHistory = [1, 2, 3, 4, 5].map((number) => ({
    id: `old-${number}`,
    title: `旧记录 ${number}`,
    createdAt: "2026-06-16 10:00",
    request: { ingredients: `食材 ${number}` },
    recipes
  }));

  const history = addHistoryEntry(existingHistory, {
    request: {
      ingredients: "鸡蛋",
      preferences: "不辣",
      servings: "2 人",
      avoidances: "香菜",
      maxTime: "20 分钟内"
    },
    recipes,
    now: new Date("2026-06-16T12:00:00")
  });

  assert.equal(history.length, 5);
  assert.equal(history[0].title, "鸡蛋 · 2 人 · 20 分钟内");
  assert.equal(history[0].recipes.length, 3);
  assert.equal(history[4].id, "old-4");
}

function testAddFavoriteEntryKeepsLatestTenAndMovesDuplicateFirst() {
  const recipe = getMockRecipes("鸡蛋", "不辣")[0];
  const existingFavorites = Array.from({ length: 10 }, (_, index) => ({
    id: `old-${index}`,
    title: `旧收藏 ${index}`,
    createdAt: "2026-06-16 10:00",
    recipe: {
      ...recipe,
      id: `old-recipe-${index}`,
      name: `旧菜谱 ${index}`
    }
  }));

  const favorites = addFavoriteEntry(existingFavorites, {
    recipe,
    request: {
      ingredients: "鸡蛋",
      preferences: "不辣",
      servings: "2 人",
      maxTime: "20 分钟内"
    },
    now: new Date("2026-06-16T12:00:00")
  });

  const repeated = addFavoriteEntry(favorites, {
    recipe,
    request: {
      ingredients: "鸡蛋",
      preferences: "不辣",
      servings: "2 人",
      maxTime: "20 分钟内"
    },
    now: new Date("2026-06-16T12:05:00")
  });

  assert.equal(favorites.length, 10);
  assert.equal(favorites[0].title, "番茄鸡蛋盖饭");
  assert.equal(favorites[0].recipe.name, "番茄鸡蛋盖饭");
  assert.equal(repeated.length, 10);
  assert.equal(repeated.filter((item) => item.recipe.id === recipe.id).length, 1);
  assert.equal(repeated[0].recipe.id, recipe.id);
}

testEmptyIngredientsShowsMessage();
testGeneratorReturnsThreeRecipes();
testFriendlyErrorForInvalidAiShape();
testFriendlyErrorForNetworkIssue();
testGenerateButtonTextReflectsLoading();
testNormalizeRecipeResponseKeepsDebugPrompt();
testGenerateClickDoesNotPassEventAsRequest();
testBuildRecipeRequestIncludesNewFields();
testFormatRecipeForCopy();
testAddHistoryEntryKeepsLatestFive();
testAddFavoriteEntryKeepsLatestTenAndMovesDuplicateFirst();

console.log("app.test.js passed");
