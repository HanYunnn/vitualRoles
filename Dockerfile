# 後端容器：Python + ffmpeg。適用 Hugging Face Spaces（Docker）/ Render / Railway。
FROM python:3.12-slim

# ffmpeg 給 moviepy 合成/render；libgl/glib 給 onnxruntime/opencv
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces 以 uid 1000 執行 → 建立可寫的使用者與家目錄
RUN useradd -m -u 1000 user

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 程式碼歸 user 所有，確保 sessions/ 與 rembg 模型快取(~/.u2net)可寫
COPY --chown=user:user . .
RUN mkdir -p sessions && chown -R user:user /app

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# HF Spaces 讀 README 的 app_port；其他平台用 $PORT
EXPOSE 8000
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
