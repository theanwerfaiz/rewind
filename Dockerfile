FROM node:22-bookworm-slim AS base

WORKDIR /app

FROM base AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Rewind sends nothing to third parties; keep Next.js telemetry off too.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN groupadd --system --gid 1001 rewind \
    && useradd --system --uid 1001 --gid 1001 rewind

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /app/data \
    && chown -R rewind:rewind /app

USER rewind

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]