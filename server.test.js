const assert = require("node:assert/strict");

const {
  buildRecipeResponsePayload,
  buildDeepSeekRequestBody,
  buildPromptDebug,
  createRateLimiter,
  extractJsonArray,
  extractMessageContent,
  getSecurityHeaders,
  isAllowedOrigin,
  parseAllowedOrigins,
  requireApiKey,
  shouldIncludeDebug,
  validateRecipeRequestFields,
  validateRecipes
} = require("./server.js");

function createValidRecipes() {
  return [
    {
      id: "dish-1",
      name: "番茄鸡蛋盖饭",
      time: "15 分钟",
      difficulty: "简单",
      reason: "适合已有食材。",
      ingredients: ["鸡蛋", "番茄"],
      steps: ["炒鸡蛋", "炒番茄"],
      substitutions: ["米饭可以换面条"],
      tips: ["少油也好吃"]
    },
    {
      id: "dish-2",
      name: "青菜蛋炒饭",
      time: "12 分钟",
      difficulty: "简单",
      reason: "适合剩饭。",
      ingredients: ["青菜", "米饭"],
      steps: ["切菜", "炒饭"],
      substitutions: [],
      tips: []
    },
    {
      id: "dish-3",
      name: "番茄青菜汤",
      time: "10 分钟",
      difficulty: "简单",
      reason: "清淡快手。",
      ingredients: ["番茄", "青菜"],
      steps: ["煮汤", "调味"],
      substitutions: [],
      tips: []
    }
  ];
}

function testExtractJsonArrayFromPlainJson() {
  const text = JSON.stringify(createValidRecipes());

  const recipes = extractJsonArray(text);
  assert.equal(recipes.length, 3);
  assert.equal(recipes[0].name, "番茄鸡蛋盖饭");
}

function testExtractJsonArrayFromMarkdownFence() {
  const text = '```json\n[{"id":"dish-1","name":"青菜蛋炒饭","time":"12 分钟","difficulty":"简单","reason":"快手。","ingredients":["米饭"],"steps":["炒"],"substitutions":[],"tips":[]},{"id":"dish-2","name":"番茄鸡蛋面","time":"15 分钟","difficulty":"简单","reason":"好做。","ingredients":["番茄"],"steps":["煮"],"substitutions":[],"tips":[]},{"id":"dish-3","name":"青菜汤","time":"8 分钟","difficulty":"简单","reason":"清淡。","ingredients":["青菜"],"steps":["煮"],"substitutions":[],"tips":[]}]\n```';
  const recipes = extractJsonArray(text);
  assert.equal(recipes.length, 3);
  assert.equal(recipes[0].name, "青菜蛋炒饭");
}

function testRequireApiKeyThrowsHelpfulError() {
  assert.throws(
    () => requireApiKey({}),
    /请先设置 DEEPSEEK_API_KEY/
  );
}

function testExtractMessageContentFromDeepSeekResponse() {
  const content = extractMessageContent({
    choices: [
      {
        message: {
          content: "[{\"id\":\"dish-1\"}]"
        }
      }
    ]
  });

  assert.equal(content, "[{\"id\":\"dish-1\"}]");
}

function testBuildDeepSeekRequestBodyUsesMessages() {
  const body = buildDeepSeekRequestBody({
    ingredients: "鸡蛋",
    preferences: "不辣",
    servings: "2 人",
    avoidances: "香菜",
    maxTime: "20 分钟内"
  });
  assert.equal(body.model, "deepseek-v4-flash");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].role, "user");
  assert.ok(body.messages[1].content.includes("鸡蛋"));
  assert.ok(body.messages[1].content.includes("不辣"));
  assert.ok(body.messages[1].content.includes("2 人"));
  assert.ok(body.messages[1].content.includes("香菜"));
  assert.ok(body.messages[1].content.includes("20 分钟内"));
}

function testBuildPromptDebugDoesNotExposeSecrets() {
  const requestBody = buildDeepSeekRequestBody({
    ingredients: "鸡蛋",
    preferences: "不辣",
    servings: "2 人",
    avoidances: "香菜",
    maxTime: "20 分钟内"
  });
  const debug = buildPromptDebug(requestBody);

  assert.ok(debug.system.includes("你是一个家常菜助手"));
  assert.ok(debug.user.includes("鸡蛋"));
  assert.equal(JSON.stringify(debug).includes("DEEPSEEK_API_KEY"), false);
  assert.equal(JSON.stringify(debug).includes("Bearer"), false);
}

function testValidateRecipesAcceptsCompleteRecipes() {
  const recipes = validateRecipes(createValidRecipes());
  assert.equal(recipes.length, 3);
}

function testValidateRecipesRejectsMissingField() {
  const recipes = createValidRecipes();
  delete recipes[0].steps;

  assert.throws(
    () => validateRecipes(recipes),
    /第 1 个菜谱缺少 steps/
  );
}

function testValidateRecipesRejectsWrongArrayField() {
  const recipes = createValidRecipes();
  recipes[1].ingredients = "青菜、米饭";

  assert.throws(
    () => validateRecipes(recipes),
    /第 2 个菜谱的 ingredients 必须是字符串数组/
  );
}

function testAllowedOriginsCanComeFromEnvironment() {
  const origins = parseAllowedOrigins("https://recipe.example.com, https://www.recipe.example.com", 8787);

  assert.equal(isAllowedOrigin("https://recipe.example.com", origins), true);
  assert.equal(isAllowedOrigin("https://www.recipe.example.com", origins), true);
  assert.equal(isAllowedOrigin("https://evil.example", origins), false);
}

function testDebugPayloadIsDisabledByDefault() {
  const requestBody = buildDeepSeekRequestBody({
    ingredients: "egg",
    preferences: "not spicy",
    servings: "2",
    avoidances: "",
    maxTime: "20"
  });
  const payload = buildRecipeResponsePayload(createValidRecipes(), requestBody, {});

  assert.equal(shouldIncludeDebug({}), false);
  assert.equal("debug" in payload, false);
}

function testDebugPayloadCanBeEnabledForDevelopment() {
  const requestBody = buildDeepSeekRequestBody({
    ingredients: "egg",
    preferences: "not spicy",
    servings: "2",
    avoidances: "",
    maxTime: "20"
  });
  const payload = buildRecipeResponsePayload(createValidRecipes(), requestBody, { DEBUG_PROMPT: "1" });

  assert.equal(shouldIncludeDebug({ DEBUG_PROMPT: "1" }), true);
  assert.equal(payload.debug.prompt.model, "deepseek-v4-flash");
}

function testRateLimiterBlocksAfterLimit() {
  let currentTime = 1000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => currentTime });

  assert.equal(limiter.isAllowed("user-1"), true);
  assert.equal(limiter.isAllowed("user-1"), true);
  assert.equal(limiter.isAllowed("user-1"), false);

  currentTime = 2001;
  assert.equal(limiter.isAllowed("user-1"), true);
}

function testRecipeRequestValidationRejectsLongInput() {
  const message = validateRecipeRequestFields({
    ingredients: "a".repeat(501),
    preferences: "",
    avoidances: ""
  });

  assert.ok(message.includes("ingredients"));
}

function testSecurityHeadersIncludeDeploymentProtections() {
  const headers = getSecurityHeaders("text/html; charset=utf-8");

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.ok(headers["Content-Security-Policy"].includes("frame-ancestors 'none'"));
  assert.ok(headers["Content-Security-Policy"].includes("base-uri 'self'"));
}

testExtractJsonArrayFromPlainJson();
testExtractJsonArrayFromMarkdownFence();
testRequireApiKeyThrowsHelpfulError();
testExtractMessageContentFromDeepSeekResponse();
testBuildDeepSeekRequestBodyUsesMessages();
testBuildPromptDebugDoesNotExposeSecrets();
testValidateRecipesAcceptsCompleteRecipes();
testValidateRecipesRejectsMissingField();
testValidateRecipesRejectsWrongArrayField();
testAllowedOriginsCanComeFromEnvironment();
testDebugPayloadIsDisabledByDefault();
testDebugPayloadCanBeEnabledForDevelopment();
testRateLimiterBlocksAfterLimit();
testRecipeRequestValidationRejectsLongInput();
testSecurityHeadersIncludeDeploymentProtections();

console.log("server.test.js passed");
