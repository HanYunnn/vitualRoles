#!/usr/bin/env bash
# 一鍵關閉：後端 + 前端 + 通道
echo "▶ 關閉服務…"
lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "後端已關" || echo "後端本來就沒開"
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "前端已關" || echo "前端本來就沒開"
pkill cloudflared 2>/dev/null && echo "通道已關" || echo "通道本來就沒開"
echo "—— 全部關閉 ——"
