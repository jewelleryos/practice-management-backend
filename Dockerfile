# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Backend image — Bun + Hono API.
#
# There is NO build step: Bun runs the TypeScript source directly. So this is a
# single-stage image — install deps, copy the source, and run src/index.ts.
#
# Runtime config comes from environment variables (DATABASE_URL, AUTH_JWT_SECRET,
# ALLOWED_ORIGINS, …) injected by Dokploy at runtime — nothing is baked in here.
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1-alpine
WORKDIR /app

# Install deps first so this layer stays cached until the manifest/lockfile change.
# --production skips devDependencies (only @types/* live there — not needed at runtime).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# App source (after install, so editing code doesn't bust the dependency cache).
COPY . .

ENV NODE_ENV=production
# Container listens on 8787 (overridable via the PORT env var). Host 0.0.0.0 is
# required inside Docker so the port is reachable from outside the container.
ENV PORT=8787
ENV HOST=0.0.0.0
EXPOSE 8787

# Bun executes the TypeScript entrypoint directly — no compile, no --hot in prod.
CMD ["bun", "run", "src/index.ts"]
