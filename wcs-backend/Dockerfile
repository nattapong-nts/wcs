# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency files first (layer cache)
COPY package.json pnpm-lock.yaml ./

# Install ALL deps (including devDeps needed for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Compile TypeScript → dist/
RUN pnpm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy only what's needed to run
COPY package.json pnpm-lock.yaml ./

# Install production deps only (no devDeps)
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder stage — NO source code here
COPY --from=builder /app/dist ./dist

# Log directory (persisted via volume mount)
RUN mkdir -p logs/task-audit

EXPOSE 3003

CMD ["node", "dist/main"]