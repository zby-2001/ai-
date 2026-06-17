@echo off
set HTTP_PROXY=http://127.0.0.1:10808
set HTTPS_PROXY=http://127.0.0.1:10808
set NODE_USE_ENV_PROXY=1
set DEBUG_PROMPT=1

"C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
