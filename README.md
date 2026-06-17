# AI 冰箱食材助手

这是一个小白友好的 vibe coding 练习项目。

## 怎么运行

现在这个项目已经接入本地后端。推荐用本地服务打开页面：

```powershell
cd C:\Users\pc\Documents\Codex\2026-06-16\vibe-coding\outputs\ai-recipe-generator
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
.\start-server.cmd
```

然后打开：

```text
http://localhost:8787
```

如果你的账号需要指定其他 DeepSeek 模型，可以额外设置：

```powershell
$env:DEEPSEEK_MODEL="你的模型名称"
.\start-server.cmd
```

## 网络代理说明

如果页面显示 `fetch failed`，通常是 Node 后端没有走系统代理。当前启动脚本会自动使用：

```text
http://127.0.0.1:10808
```

如果你的代理端口变化了，修改 `start-server.cmd` 里的 `HTTP_PROXY` 和 `HTTPS_PROXY`。

## 你会练到什么

- HTML：页面结构、表单、结果区域。
- CSS：卡片布局、按钮样式、移动端适配。
- JavaScript：读取输入、校验、加载状态、渲染列表、点击切换详情。
- API 思维：前端请求本地 `/api/recipes`，后端再调用 DeepSeek API。

## 当前版本功能

- 输入已有食材。
- 输入做饭偏好。
- 设置用餐人数。
- 设置忌口要求。
- 设置期望烹饪时间。
- 通过 DeepSeek API 生成 3 个菜谱。
- 点击菜谱卡片查看详情。
- 空输入时显示提示。
- 支持桌面和手机宽度布局。
- API Key 只放在本地后端环境变量里，不写进浏览器代码。

## 下一步可以升级

- 增加“忌口”输入。
- 增加“复制菜谱”按钮。
- 保存最近生成的菜谱。
- 增加生成失败时的重试按钮。

## 部署前检查

上线时不要把 API Key 写进 `app.js` 或 `index.html`，只放在服务器环境变量里。

必填环境变量：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
ALLOWED_ORIGINS=https://你的正式域名
HOST=0.0.0.0
```

常用可选环境变量：

```text
PORT=8787
DEEPSEEK_MODEL=deepseek-v4-flash
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=60000
```

开发调试时才打开：

```text
DEBUG_PROMPT=1
```

正式部署建议不要设置 `DEBUG_PROMPT=1`，这样后端不会把 Prompt 调试内容返回给浏览器。

如果项目部署在反向代理后面，并且代理会正确清理 `X-Forwarded-For`，才设置：

```text
TRUST_PROXY=1
```
