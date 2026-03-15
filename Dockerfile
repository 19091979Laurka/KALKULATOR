# ── Stage 1: Budowanie React frontendu ──────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend-react

# package*.json i patches/ (postinstall=patch-package wymaga katalogu patches)
COPY frontend-react/package.json frontend-react/package-lock.json ./
COPY frontend-react/patches ./patches
# npm install zamiast npm ci — odporniejsze w Cloud Build (postinstall/patch-package)
RUN npm install --legacy-peer-deps

COPY frontend-react/ ./
ENV NODE_ENV=production
RUN npm run build

# ── Stage 2: Python backend + gotowy React ───────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libjpeg-dev \
    libpng-dev \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend-react/build/ ./frontend-react/build/

ENV PORT=8000
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
