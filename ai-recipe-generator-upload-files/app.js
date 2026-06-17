function validateIngredients(ingredients) {
  if (!ingredients.trim()) {
    return "请先输入至少一种食材。";
  }

  return "";
}

function getMockRecipes(ingredients, preferences) {
  const preferenceText = preferences || "无特殊偏好";
  const baseReason = `根据你输入的“${ingredients}”和“${preferenceText}”推荐。`;

  return [
    {
      id: "tomato-egg-rice",
      name: "番茄鸡蛋盖饭",
      time: "15 分钟",
      difficulty: "简单",
      reason: `${baseReason} 这道菜快手、下饭，适合用鸡蛋、番茄和米饭。`,
      ingredients: ["鸡蛋 2 个", "番茄 1-2 个", "米饭 1 碗", "葱花 少许"],
      steps: ["番茄切块，鸡蛋打散。", "先炒鸡蛋，盛出备用。", "炒软番茄后倒回鸡蛋。", "调味后盖在米饭上。"],
      substitutions: ["没有米饭时可以换成面条。", "没有番茄时可以换成青椒或洋葱。"],
      tips: ["番茄偏酸时可以加一点糖。"]
    },
    {
      id: "green-egg-fried-rice",
      name: "青菜蛋炒饭",
      time: "12 分钟",
      difficulty: "简单",
      reason: `${baseReason} 适合处理剩米饭，也能把青菜一起用掉。`,
      ingredients: ["米饭 1 碗", "鸡蛋 1 个", "青菜 1 把", "生抽 少许"],
      steps: ["青菜切碎，鸡蛋打散。", "锅中倒油，先炒鸡蛋。", "加入米饭炒散。", "加入青菜和调味料炒匀。"],
      substitutions: ["青菜可以换成白菜、生菜或菠菜。"],
      tips: ["米饭偏干更容易炒散。"]
    },
    {
      id: "light-vegetable-soup",
      name: "番茄青菜汤",
      time: "10 分钟",
      difficulty: "简单",
      reason: `${baseReason} 做法清淡，适合想少油一点的时候。`,
      ingredients: ["番茄 1 个", "青菜 1 把", "鸡蛋 1 个", "清水 适量"],
      steps: ["番茄切块，青菜洗净。", "锅中加水和番茄煮开。", "倒入蛋液形成蛋花。", "加入青菜，调味后出锅。"],
      substitutions: ["可以加入豆腐增加饱腹感。"],
      tips: ["最后放青菜，颜色更好看。"]
    }
  ];
}

function buildRecipeRequest({ ingredients, preferences, servings, avoidances, maxTime }) {
  return {
    ingredients: ingredients.trim(),
    preferences: preferences.trim(),
    servings,
    avoidances: avoidances.trim(),
    maxTime
  };
}

async function requestRecipesFromApi(recipeRequest) {
  const response = await fetch("/api/recipes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(recipeRequest)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "生成菜谱失败。");
  }

  return normalizeRecipeResponse(result);
}

function normalizeRecipeResponse(result) {
  return {
    recipes: result.recipes || [],
    debug: result.debug || null
  };
}

function getFriendlyErrorMessage(error) {
  const message = error.message || "";

  if (message.includes("必须是字符串数组") || message.includes("缺少") || message.includes("应该返回 3 个菜谱")) {
    return "这次 AI 返回的菜谱格式不完整，请再生成一次。";
  }

  if (message.includes("DEEPSEEK_API_KEY")) {
    return "请先在后端设置 DEEPSEEK_API_KEY。";
  }

  if (message.includes("Authentication")) {
    return "DeepSeek API Key 无效，请检查后重新启动后端。";
  }

  return message || "生成菜谱失败，请稍后再试。";
}

function getGenerateButtonText(isLoading) {
  return isLoading ? "正在问 AI..." : "生成 3 个菜谱";
}

function formatRecipeForCopy(recipe) {
  return [
    `${recipe.name}`,
    `用时：${recipe.time}`,
    `难度：${recipe.difficulty}`,
    `推荐理由：${recipe.reason}`,
    "",
    "所需食材：",
    ...recipe.ingredients.map((item) => `- ${item}`),
    "",
    "制作步骤：",
    ...recipe.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "替换建议：",
    ...recipe.substitutions.map((item) => `- ${item}`),
    "",
    "小贴士：",
    ...recipe.tips.map((tip) => `- ${tip}`)
  ].join("\n");
}

const HISTORY_KEY = "ai-recipe-history";
const FAVORITES_KEY = "ai-recipe-favorites";

function createHistoryTitle(request) {
  return `${request.ingredients} · ${request.servings || "2 人"} · ${request.maxTime || "20 分钟内"}`;
}

function addHistoryEntry(history, { request, recipes, now = new Date() }) {
  const entry = {
    id: `${now.getTime()}`,
    title: createHistoryTitle(request),
    createdAt: now.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }),
    request,
    recipes
  };

  return [entry, ...history].slice(0, 5);
}

function addFavoriteEntry(favorites, { recipe, request, now = new Date() }) {
  const entry = {
    id: `${recipe.id}-${now.getTime()}`,
    title: recipe.name,
    createdAt: now.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }),
    subtitle: `${request.ingredients || "未知食材"} · ${request.servings || "2 人"} · ${request.maxTime || "20 分钟内"}`,
    request,
    recipe
  };
  const withoutDuplicate = favorites.filter((item) => item.recipe.id !== recipe.id);

  return [entry, ...withoutDuplicate].slice(0, 10);
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveFavorites(favorites) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function createElement(tagName, { className, text, attributes = {} } = {}) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

function createList(tagName, items) {
  const list = document.createElement(tagName);

  for (const item of items) {
    list.appendChild(createElement("li", { text: item }));
  }

  return list;
}

function initRecipeApp() {
  const ingredientsInput = document.querySelector("#ingredients");
  const preferencesInput = document.querySelector("#preferences");
  const servingsInput = document.querySelector("#servings");
  const avoidancesInput = document.querySelector("#avoidances");
  const maxTimeInput = document.querySelector("#maxTime");
  const formMessage = document.querySelector("#formMessage");
  const generateBtn = document.querySelector("#generateBtn");
  const statusBox = document.querySelector("#statusBox");
  const recipeGrid = document.querySelector("#recipeGrid");
  const recipeDetail = document.querySelector("#recipeDetail");
  const toggleDebugBtn = document.querySelector("#toggleDebugBtn");
  const debugPanel = document.querySelector("#debugPanel");
  const retryBtn = document.querySelector("#retryBtn");
  const regenerateBtn = document.querySelector("#regenerateBtn");
  const historyList = document.querySelector("#historyList");
  const clearHistoryBtn = document.querySelector("#clearHistoryBtn");
  const favoritesList = document.querySelector("#favoritesList");
  const clearFavoritesBtn = document.querySelector("#clearFavoritesBtn");

  let currentRecipes = [];
  let selectedRecipeId = "";
  let lastRecipeRequest = null;
  let lastFailedRequest = null;
  let lastDebug = null;
  let history = loadHistory();
  let favorites = loadFavorites();

  const formControls = [
    ingredientsInput,
    preferencesInput,
    servingsInput,
    avoidancesInput,
    maxTimeInput,
    generateBtn,
    retryBtn,
    regenerateBtn,
    clearHistoryBtn,
    clearFavoritesBtn
  ];

  function setStatusText(message) {
    statusBox.textContent = message;
  }

  function setLoadingStatus() {
    clearElement(statusBox);
    const wrapper = createElement("span", { className: "status-loading" });
    wrapper.appendChild(createElement("span", { className: "loading-dot" }));
    wrapper.appendChild(createElement("span", { text: "正在问 AI，正在整理 3 个菜谱..." }));
    statusBox.appendChild(wrapper);
  }

  function renderHistory() {
    clearElement(historyList);

    if (!history.length) {
      historyList.appendChild(createElement("p", {
        className: "history-empty",
        text: "还没有生成记录。"
      }));
      return;
    }

    for (const entry of history) {
      const button = createElement("button", {
        className: "history-item",
        attributes: {
          type: "button",
          "data-history-id": entry.id
        }
      });

      button.appendChild(createElement("strong", { text: entry.title }));
      button.appendChild(createElement("span", { text: entry.createdAt }));
      historyList.appendChild(button);
    }
  }

  function renderFavorites() {
    clearElement(favoritesList);

    if (!favorites.length) {
      favoritesList.appendChild(createElement("p", {
        className: "history-empty",
        text: "还没有收藏菜谱。"
      }));
      return;
    }

    for (const favorite of favorites) {
      const button = createElement("button", {
        className: "history-item",
        attributes: {
          type: "button",
          "data-favorite-id": favorite.id
        }
      });

      button.appendChild(createElement("strong", { text: favorite.title }));
      button.appendChild(createElement("span", { text: favorite.subtitle || favorite.createdAt }));
      button.appendChild(createElement("span", { text: favorite.createdAt }));
      favoritesList.appendChild(button);
    }
  }

  function renderDebugPanel() {
    clearElement(debugPanel);

    if (!lastDebug?.prompt) {
      debugPanel.appendChild(createElement("p", { text: "暂无调试信息。" }));
      return;
    }

    const prompt = lastDebug.prompt;
    debugPanel.appendChild(createElement("h2", { text: "Prompt 调试信息" }));
    debugPanel.appendChild(createElement("h3", { text: "模型" }));
    debugPanel.appendChild(createElement("pre", { text: prompt.model || "未知模型" }));
    debugPanel.appendChild(createElement("h3", { text: "System Prompt" }));
    debugPanel.appendChild(createElement("pre", { text: prompt.system || "" }));
    debugPanel.appendChild(createElement("h3", { text: "User Prompt" }));
    debugPanel.appendChild(createElement("pre", { text: prompt.user || "" }));
  }

  function renderRecipes(recipes) {
    clearElement(recipeGrid);

    for (const recipe of recipes) {
      const card = createElement("button", {
        className: `recipe-card${recipe.id === selectedRecipeId ? " is-selected" : ""}`,
        attributes: {
          type: "button",
          "data-id": recipe.id
        }
      });
      const meta = createElement("div", { className: "meta" });

      meta.appendChild(createElement("span", { className: "pill", text: recipe.time }));
      meta.appendChild(createElement("span", { className: "pill", text: recipe.difficulty }));

      card.appendChild(createElement("h2", { text: recipe.name }));
      card.appendChild(meta);
      card.appendChild(createElement("p", { text: recipe.reason }));
      recipeGrid.appendChild(card);
    }
  }

  function renderDetail(recipe) {
    recipeDetail.hidden = false;
    clearElement(recipeDetail);

    const header = createElement("div", { className: "detail-header" });
    const copyButton = createElement("button", {
      className: "copy-button",
      text: "复制菜谱",
      attributes: {
        type: "button",
        "data-copy-id": recipe.id
      }
    });
    const favoriteButton = createElement("button", {
      className: "favorite-button",
      text: "收藏此菜谱",
      attributes: {
        type: "button",
        "data-favorite-recipe-id": recipe.id
      }
    });

    header.appendChild(createElement("h2", { text: recipe.name }));
    header.appendChild(copyButton);
    header.appendChild(favoriteButton);

    recipeDetail.appendChild(header);
    recipeDetail.appendChild(createElement("h3", { text: "所需食材" }));
    recipeDetail.appendChild(createList("ul", recipe.ingredients));
    recipeDetail.appendChild(createElement("h3", { text: "制作步骤" }));
    recipeDetail.appendChild(createList("ol", recipe.steps));
    recipeDetail.appendChild(createElement("h3", { text: "替换建议" }));
    recipeDetail.appendChild(createList("ul", recipe.substitutions));
    recipeDetail.appendChild(createElement("h3", { text: "小贴士" }));
    recipeDetail.appendChild(createList("ul", recipe.tips));
  }

  function selectRecipe(recipeId) {
    selectedRecipeId = recipeId;
    const recipe = currentRecipes.find((item) => item.id === recipeId);
    renderRecipes(currentRecipes);
    renderDetail(recipe);
  }

  function restoreHistoryEntry(entryId) {
    const entry = history.find((item) => item.id === entryId);
    if (!entry) return;

    ingredientsInput.value = entry.request.ingredients || "";
    preferencesInput.value = entry.request.preferences || "";
    servingsInput.value = entry.request.servings || "2 人";
    avoidancesInput.value = entry.request.avoidances || "";
    maxTimeInput.value = entry.request.maxTime || "20 分钟内";

    lastRecipeRequest = entry.request;
    lastDebug = null;
    regenerateBtn.hidden = false;
    toggleDebugBtn.hidden = true;
    debugPanel.hidden = true;
    currentRecipes = entry.recipes;
    selectedRecipeId = currentRecipes[0].id;
    statusBox.textContent = "已恢复历史记录，点击卡片查看详细步骤。";
    renderRecipes(currentRecipes);
    renderDetail(currentRecipes[0]);
  }

  function restoreFavoriteEntry(entryId) {
    const favorite = favorites.find((item) => item.id === entryId);
    if (!favorite) return;

    if (favorite.request) {
      ingredientsInput.value = favorite.request.ingredients || "";
      preferencesInput.value = favorite.request.preferences || "";
      servingsInput.value = favorite.request.servings || "2 人";
      avoidancesInput.value = favorite.request.avoidances || "";
      maxTimeInput.value = favorite.request.maxTime || "20 分钟内";
      lastRecipeRequest = favorite.request;
      lastDebug = null;
      regenerateBtn.hidden = false;
      toggleDebugBtn.hidden = true;
      debugPanel.hidden = true;
    }

    currentRecipes = [favorite.recipe];
    selectedRecipeId = favorite.recipe.id;
    statusBox.textContent = "已打开收藏菜谱。";
    renderRecipes(currentRecipes);
    renderDetail(favorite.recipe);
  }

  function setLoading(isLoading) {
    for (const control of formControls) {
      control.disabled = isLoading;
    }

    generateBtn.textContent = getGenerateButtonText(isLoading);
  }

  function getCurrentRecipeRequest() {
    return buildRecipeRequest({
      ingredients: ingredientsInput.value.trim(),
      preferences: preferencesInput.value.trim(),
      servings: servingsInput.value,
      avoidances: avoidancesInput.value,
      maxTime: maxTimeInput.value
    });
  }

  function applyRecipeRequest(recipeRequest) {
    ingredientsInput.value = recipeRequest.ingredients || "";
    preferencesInput.value = recipeRequest.preferences || "";
    servingsInput.value = recipeRequest.servings || "2 人";
    avoidancesInput.value = recipeRequest.avoidances || "";
    maxTimeInput.value = recipeRequest.maxTime || "20 分钟内";
  }

  async function generateRecipes(recipeRequest = getCurrentRecipeRequest()) {
    const validationMessage = validateIngredients(recipeRequest.ingredients);
    formMessage.textContent = "";
    recipeDetail.hidden = true;
    retryBtn.hidden = true;
    toggleDebugBtn.hidden = true;
    debugPanel.hidden = true;

    if (validationMessage) {
      formMessage.textContent = validationMessage;
      ingredientsInput.focus();
      return;
    }

    setLoading(true);
    setLoadingStatus();
    regenerateBtn.disabled = true;
    clearElement(recipeGrid);

    try {
      const result = await requestRecipesFromApi(recipeRequest);
      currentRecipes = result.recipes;
      lastDebug = result.debug;
      lastRecipeRequest = recipeRequest;
      lastFailedRequest = null;
      selectedRecipeId = currentRecipes[0].id;
      setStatusText("已生成 3 个方案，点击卡片查看详细步骤。");
      regenerateBtn.hidden = false;
      toggleDebugBtn.hidden = !lastDebug;
      renderDebugPanel();
      renderRecipes(currentRecipes);
      renderDetail(currentRecipes[0]);
      history = addHistoryEntry(history, { request: recipeRequest, recipes: currentRecipes });
      saveHistory(history);
      renderHistory();
    } catch (error) {
      lastFailedRequest = recipeRequest;
      setStatusText(getFriendlyErrorMessage(error));
      retryBtn.hidden = false;
      toggleDebugBtn.hidden = true;
      debugPanel.hidden = true;
      clearElement(recipeGrid);
      recipeDetail.hidden = true;
    } finally {
      setLoading(false);
      regenerateBtn.disabled = false;
    }
  }

  generateBtn.addEventListener("click", () => generateRecipes());

  recipeGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".recipe-card");
    if (!card) return;
    selectRecipe(card.dataset.id);
  });

  recipeDetail.addEventListener("click", async (event) => {
    const favoriteButton = event.target.closest("[data-favorite-recipe-id]");
    if (favoriteButton) {
      const recipe = currentRecipes.find((item) => item.id === favoriteButton.dataset.favoriteRecipeId);
      if (!recipe) return;

      favorites = addFavoriteEntry(favorites, {
        recipe,
        request: lastRecipeRequest || buildRecipeRequest({
          ingredients: ingredientsInput.value,
          preferences: preferencesInput.value,
          servings: servingsInput.value,
          avoidances: avoidancesInput.value,
          maxTime: maxTimeInput.value
        })
      });
      saveFavorites(favorites);
      renderFavorites();
      favoriteButton.textContent = "已收藏";
      window.setTimeout(() => {
        favoriteButton.textContent = "收藏此菜谱";
      }, 1200);
      return;
    }

    const button = event.target.closest("[data-copy-id]");
    if (!button) return;

    const recipe = currentRecipes.find((item) => item.id === button.dataset.copyId);
    if (!recipe) return;

    try {
      await navigator.clipboard.writeText(formatRecipeForCopy(recipe));
      button.textContent = "已复制";
      window.setTimeout(() => {
        button.textContent = "复制菜谱";
      }, 1200);
    } catch (error) {
      button.textContent = "复制失败";
      window.setTimeout(() => {
        button.textContent = "复制菜谱";
      }, 1600);
    }
  });

  historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-id]");
    if (!button) return;
    restoreHistoryEntry(button.dataset.historyId);
  });

  favoritesList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-favorite-id]");
    if (!button) return;
    restoreFavoriteEntry(button.dataset.favoriteId);
  });

  clearHistoryBtn.addEventListener("click", () => {
    history = [];
    saveHistory(history);
    renderHistory();
  });

  clearFavoritesBtn.addEventListener("click", () => {
    favorites = [];
    saveFavorites(favorites);
    renderFavorites();
  });

  regenerateBtn.addEventListener("click", () => {
    if (!lastRecipeRequest) return;
    applyRecipeRequest(lastRecipeRequest);
    generateRecipes(lastRecipeRequest);
  });

  retryBtn.addEventListener("click", () => {
    if (!lastFailedRequest) return;
    applyRecipeRequest(lastFailedRequest);
    generateRecipes(lastFailedRequest);
  });

  toggleDebugBtn.addEventListener("click", () => {
    debugPanel.hidden = !debugPanel.hidden;
    toggleDebugBtn.textContent = debugPanel.hidden ? "显示调试信息" : "隐藏调试信息";
  });

  renderHistory();
  renderFavorites();
}

if (typeof document !== "undefined") {
  initRecipeApp();
}

if (typeof module !== "undefined") {
  module.exports = {
    buildRecipeRequest,
    formatRecipeForCopy,
    getGenerateButtonText,
    getFriendlyErrorMessage,
    getMockRecipes,
    addHistoryEntry,
    addFavoriteEntry,
    normalizeRecipeResponse,
    requestRecipesFromApi,
    validateIngredients
  };
}
