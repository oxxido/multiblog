FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN pnpm build

# Migraciones y seed necesitan drizzle-kit y tsx (devDependencies): usan
# `deps`, no `prod-deps`. `app` en runtime no carga ninguna de las dos.
FROM deps AS migrate
COPY drizzle.config.ts ./
COPY src ./src
CMD ["sh", "-c", "pnpm exec drizzle-kit migrate && pnpm exec tsx src/db/seed.ts"]

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY src/views ./src/views
COPY content ./content
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/server.js"]
