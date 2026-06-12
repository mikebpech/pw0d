# pw0d server — single image: Next.js standalone (web vault + API) + SQLite.
# Build from the REPO ROOT:  docker build -f apps/web/Dockerfile -t pw0d .

FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# Migrations run on boot; cover both possible working directories.
COPY --from=builder /app/apps/web/drizzle ./drizzle
COPY --from=builder /app/apps/web/drizzle ./apps/web/drizzle
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
