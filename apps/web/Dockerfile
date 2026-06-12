# pw0d server — single image: Next.js standalone (web vault + API) + SQLite.
# Build from the REPO ROOT:  docker build -f apps/web/Dockerfile -t pw0d .

FROM node:24-alpine AS builder
# Raise Node's heap ceiling so the build/type-check can use swap on tiny boxes
# (512 MB droplets otherwise OOM during the TypeScript phase of `next build`).
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Package the browser extension and serve it from the web app's /install page.
RUN pnpm --filter @pw0d/extension zip \
    && mkdir -p apps/web/public \
    && cp apps/extension/.output/*-chrome.zip apps/web/public/pw0d-extension.zip
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
