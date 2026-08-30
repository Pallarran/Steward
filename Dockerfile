FROM node:22-alpine AS base
RUN corepack enable pnpm

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma 7 loads prisma.config.ts, which requires DATABASE_URL.
# Provide a dummy — generate only reads the schema, it never connects.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_BUILD_WORKERS=2
RUN pnpm exec prisma generate
RUN pnpm build

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output. --chown matters: the server runs as nextjs, and
# next/image writes optimised files into .next/cache/images at request time.
# Root-owned copies leave that unwritable and /_next/image 500s.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next
# Schema, config and the generated client, for migrate/seed/reset one-offs
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/generated ./src/generated
# Full node_modules last: it replaces standalone's pruned copy so the Prisma
# CLI and tsx are available to `docker compose run --rm app ...`
COPY --from=deps /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
