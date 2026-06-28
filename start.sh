#!/usr/bin/env bash
# 一鍵啟動：後端(8000) + 前端(5173)，可選通道。掉了重跑這支即可。
# 用法：
#   ./start.sh           只起後端 + 前端
#   ./start.sh tunnel    再開 cloudflare 分享通道並印出網址
set -u
cd "$(dirname "$0")"

up() { lsof -ti:"$1" >/dev/null 2>&1; }   # port 是否已在聽

# --- 後端 ---
if up 8000; then
  echo "✅ 後端已在跑 (8000)"
else
  echo "▶ 啟動後端…"
  # shellcheck disable=SC1091
  source venv/bin/activate
  nohup uvicorn api:app --port 8000 > /tmp/vlt-api.log 2>&1 &
  disown 2>/dev/null || true
  for i in {1..15}; do up 8000 && break; sleep 1; done
  up 8000 && echo "✅ 後端 OK (8000)" || { echo "✗ 後端啟動失敗，看 /tmp/vlt-api.log"; tail -5 /tmp/vlt-api.log; }
fi

# --- 前端 ---
if up 5173; then
  echo "✅ 前端已在跑 (5173)"
else
  echo "▶ 啟動前端…"
  ( cd frontend && nohup npm run dev > /tmp/vlt-fe.log 2>&1 & )
  for i in {1..20}; do up 5173 && break; sleep 1; done
  up 5173 && echo "✅ 前端 OK → http://localhost:5173" || { echo "✗ 前端啟動失敗，看 /tmp/vlt-fe.log"; tail -5 /tmp/vlt-fe.log; }
fi

# --- 通道（可選）---
if [ "${1:-}" = "tunnel" ]; then
  pkill cloudflared 2>/dev/null || true
  echo "▶ 開啟分享通道…"
  nohup cloudflared tunnel --url http://localhost:5173 > /tmp/vlt-tunnel.log 2>&1 &
  disown 2>/dev/null || true
  URL=""
  for i in {1..20}; do
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/vlt-tunnel.log | head -1)
    [ -n "$URL" ] && break; sleep 1
  done
  [ -n "$URL" ] && echo "🔗 分享網址：$URL" || { echo "✗ 通道還沒就緒，看 /tmp/vlt-tunnel.log"; tail -5 /tmp/vlt-tunnel.log; }
fi

echo "—— 完成。打開 http://localhost:5173 ——"
