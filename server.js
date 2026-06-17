const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
const ROOT_DIR = __dirname;
const MAX_REQUEST_BODY_LENGTH = Number(process.env.MAX_REQUEST_BODY_LENGTH || 50_000);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 10);
const FIELD_LIMITS = {
  ingredients: 500,
  preferences: 300,
  avoidances: 300
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function parseAllowedOrigins(rawOrigins = "", port = PORT) {
  const origins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`
  ]);

  String(rawOrigins)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .forEach((origin) => origins.add(origin));

  return origins;
}

function shouldIncludeDebug(env = process.env) {
  return env.DEBUG_PROMPT === "1";
}

function validateRecipeRequestFields({ ingredients, preferences, avoidances }) {
  if (!ingredients) {
    return "请先输入至少一种食材。";
  }

  const fields = { ingredients, preferences, avoidances };

  for (const [fieldName, maxLength] of Object.entries(FIELD_LIMITS)) {
    if (fields[fieldName].length > maxLength) {
      return `输入内容太长，请把 ${fieldName} 缩短到 ${maxLength} 个字以内。`;
    }
  }

  return "";
}

function createRateLimiter({ windowMs = RATE_LIMIT_WINDOW_MS, max = RATE_LIMIT_MAX, now = () => Date.now() } = {}) {
  const entries = new Map();

  return {
    isAllowed(key) {
      if (max <= 0) {
        return true;
      }

      const currentTime = now();
      const entry = entries.get(key);

      if (!entry || currentTime >= entry.resetAt) {
        entries.set(key, { count: 1, resetAt: currentTime + windowMs });
        return true;
      }

      if (entry.count >= max) {
        return false;
      }

      entry.count += 1;
      return true;
    }
  };
}

function getClientIp(request, env = process.env) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (env.TRUST_PROXY === "1" && typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.socket?.remoteAddress || "unknown";
}

function getSecurityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Content-Security-Policy": [
      "default-src 'self'",
      "connect-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY"
  };
}

function requireApiKey(env = process.env) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("请先设置 DEEPSEEK_API_KEY 环境变量。");
  }

  return env.DEEPSEEK_API_KEY;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BODY_LENGTH) {
        request.destroy();
        reject(new Error("请求内容太大。"));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("请求 JSON 格式不正确。"));
      }
    });

    request.on("error", reject);
  });
}

function isAllowedOrigin(origin, allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)) {
  return !origin || allowedOrigins.has(origin);
}

function getCorsHeaders(request) {
  const origin = request.headers.origin;
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function sendJson(request, response, statusCode, data) {
  response.writeHead(statusCode, getCorsHeaders(request));
  response.end(JSON.stringify(data));
}

function getSafeClientError(error) {
  const message = error.message || "";

  if (message.includes("DEEPSEEK_API_KEY")) {
    return "请先设置 DEEPSEEK_API_KEY 环境变量。";
  }

  if (message.includes("Authentication") || message.includes("api key")) {
    return "DeepSeek API Key 无效，请检查后重新启动后端。";
  }

  if (message.includes("fetch failed") || message.includes("Connect Timeout")) {
    return "无法连接 DeepSeek API，请检查网络或代理。";
  }

  if (
    message.includes("请求内容太大") ||
    message.includes("请求 JSON") ||
    message.includes("AI") ||
    message.includes("DeepSeek") ||
    message.includes("菜谱")
  ) {
    return message;
  }

  return "生成菜谱失败，请稍后再试。";
}

function extractMessageContent(apiResult) {
  const content = apiResult.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek 返回内容为空。");
  }

  return content;
}

function extractJsonArray(text) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 返回内容不是菜谱 JSON 数组。");
  }

  const recipes = JSON.parse(cleaned.slice(start, end + 1));

  if (!Array.isArray(recipes) || recipes.length !== 3) {
    throw new Error("AI 应该返回 3 个菜谱。");
  }

  return recipes;
}

function validateRecipes(recipes) {
  const textFields = ["id", "name", "time", "difficulty", "reason"];
  const arrayFields = ["ingredients", "steps", "substitutions", "tips"];

  if (!Array.isArray(recipes) || recipes.length !== 3) {
    throw new Error("AI 应该返回 3 个菜谱。");
  }

  recipes.forEach((recipe, index) => {
    const recipeNumber = index + 1;

    if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
      throw new Error(`第 ${recipeNumber} 个菜谱必须是对象。`);
    }

    for (const field of textFields) {
      if (typeof recipe[field] !== "string" || !recipe[field].trim()) {
        throw new Error(`第 ${recipeNumber} 个菜谱缺少 ${field}。`);
      }
    }

    for (const field of arrayFields) {
      if (!(field in recipe)) {
        throw new Error(`第 ${recipeNumber} 个菜谱缺少 ${field}。`);
      }

      if (!Array.isArray(recipe[field]) || recipe[field].some((item) => typeof item !== "string")) {
        throw new Error(`第 ${recipeNumber} 个菜谱的 ${field} 必须是字符串数组。`);
      }
    }
  });

  return recipes;
}

function buildDeepSeekRequestBody({
  ingredients,
  preferences,
  servings,
  avoidances,
  maxTime
}) {
  return {
    model: DEEPSEEK_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是一个家常菜助手。",
          "根据用户已有食材和偏好，生成 3 个真实可做的菜谱。",
          "只返回 JSON，不要返回 Markdown，不要解释。",
          "JSON 顶层必须是对象，格式为：{\"recipes\":[...]}。",
          "recipes 必须包含 3 个菜谱对象。",
          "每个菜谱对象必须包含这些字段：id, name, time, difficulty, reason, ingredients, steps, substitutions, tips。",
          "ingredients、steps、substitutions、tips 都必须是字符串数组。",
          "id 使用英文小写和连字符。"
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `已有食材：${ingredients}`,
          `做饭偏好：${preferences || "无特殊偏好"}`,
          `用餐人数：${servings || "2 人"}`,
          `忌口要求：${avoidances || "无"}`,
          `烹饪时间：${maxTime || "20 分钟内"}`,
          "请按人数估算食材用量，避开忌口内容，并优先选择能在指定时间内完成的做法。"
        ].join("\n")
      }
    ]
  };
}

function buildPromptDebug(requestBody) {
  return {
    model: requestBody.model,
    system: requestBody.messages.find((message) => message.role === "system")?.content || "",
    user: requestBody.messages.find((message) => message.role === "user")?.content || ""
  };
}

function parseRecipeResponse(text) {
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed.recipes;
}

function buildRecipeResponsePayload(recipes, requestBody, env = process.env) {
  const payload = { recipes };

  if (shouldIncludeDebug(env)) {
    payload.debug = {
      prompt: buildPromptDebug(requestBody)
    };
  }

  return payload;
}

async function generateRecipesWithDeepSeek({ ingredients, preferences, servings, avoidances, maxTime }) {
  const apiKey = requireApiKey();
  const requestBody = buildDeepSeekRequestBody({
    ingredients,
    preferences,
    servings,
    avoidances,
    maxTime
  });

  const apiResponse = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const apiResult = await apiResponse.json();

  if (!apiResponse.ok) {
    const message = apiResult.error?.message || "DeepSeek API 请求失败。";
    throw new Error(message);
  }

  return buildRecipeResponsePayload(
    validateRecipes(parseRecipeResponse(extractMessageContent(apiResult))),
    requestBody
  );
}

async function handleRecipeRequest(request, response) {
  try {
    const body = await readJsonBody(request);
    const ingredients = String(body.ingredients || "").trim();
    const preferences = String(body.preferences || "").trim();
    const servings = String(body.servings || "").trim();
    const avoidances = String(body.avoidances || "").trim();
    const maxTime = String(body.maxTime || "").trim();
    const validationMessage = validateRecipeRequestFields({ ingredients, preferences, avoidances });

    if (validationMessage) {
      sendJson(request, response, 400, { error: validationMessage });
      return;
    }

    const result = await generateRecipesWithDeepSeek({
      ingredients,
      preferences,
      servings,
      avoidances,
      maxTime
    });
    sendJson(request, response, 200, result);
  } catch (error) {
    sendJson(request, response, 500, { error: getSafeClientError(error) });
  }
}

function serveStaticFile(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT_DIR, pathname));

  if (!isPathInsideRoot(ROOT_DIR, filePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(200, getSecurityHeaders(contentType));
    response.end(content);
  });
}

function isPathInsideRoot(rootDir, filePath) {
  const relativePath = path.relative(rootDir, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function createServer({ rateLimiter = createRateLimiter() } = {}) {
  return http.createServer((request, response) => {
    if (!isAllowedOrigin(request.headers.origin)) {
      sendJson(request, response, 403, { error: "不允许的请求来源。" });
      return;
    }

    if (request.method === "OPTIONS") {
      sendJson(request, response, 200, {});
      return;
    }

    if (request.method === "POST" && request.url === "/api/recipes") {
      if (!rateLimiter.isAllowed(getClientIp(request))) {
        sendJson(request, response, 429, { error: "请求太频繁，请稍等一下再试。" });
        return;
      }

      handleRecipeRequest(request, response);
      return;
    }

    if (request.method === "GET") {
      serveStaticFile(request, response);
      return;
    }

    sendJson(request, response, 405, { error: "不支持这个请求方法。" });
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`AI 冰箱食材助手已启动：http://${HOST}:${PORT}`);
  });
}

module.exports = {
  buildRecipeResponsePayload,
  buildDeepSeekRequestBody,
  buildPromptDebug,
  createRateLimiter,
  createServer,
  extractJsonArray,
  extractMessageContent,
  getClientIp,
  getSafeClientError,
  getSecurityHeaders,
  isAllowedOrigin,
  isPathInsideRoot,
  parseAllowedOrigins,
  requireApiKey,
  shouldIncludeDebug,
  validateRecipeRequestFields,
  validateRecipes
};
