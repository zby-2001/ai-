const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const {
  getSafeClientError,
  isAllowedOrigin,
  isPathInsideRoot
} = require("./server.js");

function testFrontendAvoidsInnerHtml() {
  assert.equal(appSource.includes(".innerHTML"), false);
}

function testServerDoesNotAllowWildcardCors() {
  assert.equal(serverSource.includes('"Access-Control-Allow-Origin": "*"'), false);
}

function testOriginAllowlist() {
  assert.equal(isAllowedOrigin("http://localhost:8787"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:8787"), true);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
}

function testPathTraversalRejected() {
  const root = path.join(__dirname);
  assert.equal(isPathInsideRoot(root, path.join(root, "index.html")), true);
  assert.equal(isPathInsideRoot(root, path.join(root, "..", "secret.txt")), false);
}

function testProviderErrorsAreSanitized() {
  const safeMessage = getSafeClientError(new Error("Authentication Fails, Your api key: ****5812 is invalid"));
  assert.equal(safeMessage, "DeepSeek API Key 无效，请检查后重新启动后端。");
}

testFrontendAvoidsInnerHtml();
testServerDoesNotAllowWildcardCors();
testOriginAllowlist();
testPathTraversalRejected();
testProviderErrorsAreSanitized();

console.log("security.test.js passed");
