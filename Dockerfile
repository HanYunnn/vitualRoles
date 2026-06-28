# 後端容器：Python + ffmpeg（moviepy/合成需要），給 Render / Railway / Fly 用
FROM python:3.12-slim

# ffmpeg 給 moviepy 合成/render；其餘為 onnxruntime/pillow 常見執行庫
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 平台會以 $PORT 注入對外埠
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
