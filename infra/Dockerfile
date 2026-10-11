# Local test image. Build context is the repo root (its .dockerignore applies):
#   docker compose -f infra/docker-compose.yml --env-file .env build
FROM oven/bun:1.4.2-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
# Never read at build time for real: pages are dynamic. Next only needs the variables to exist.
ENV NEXT_TELEMETRY_DISABLED=1 BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime BETTER_AUTH_URL=http://localhost:3000
RUN bun --bun next build

FROM oven/bun:1.4.2-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
RUN mkdir -p /data && chown -R bun:bun /data /app/.next
USER bun
EXPOSE 3000
# Migrations and seed are idempotent, so they run on every start.
CMD ["sh", "-c", "bun scripts/migrate.ts && bun scripts/seed.ts && bun --bun next start"]
