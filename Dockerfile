# ---- Stage 1: build the React/Vite frontend ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python runtime ----
FROM python:3.12-slim

# ffmpeg é necessário pra concatenar os MP3s (audiobook/concat.py)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py recover_job.py ./
COPY audiobook/ ./audiobook/
# frontend buildado vem do estágio anterior
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Onde os áudios gerados ficam salvos. Em produção aponte um Volume aqui.
ENV OUTPUT_DIR=/data/outputs

EXPOSE 8000

# 1 worker é OBRIGATÓRIO: o estado dos jobs vive em memória (dict JOBS).
# threads atendem o polling do front + uploads enquanto o job roda em background.
# timeout 0 evita o gunicorn matar uploads grandes (até 200MB).
CMD ["sh", "-c", "gunicorn --workers 1 --threads 8 --timeout 0 --bind 0.0.0.0:${PORT:-8000} app:app"]
