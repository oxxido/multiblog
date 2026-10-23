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

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY src/views ./src/views
COPY src/db/migrations ./src/db/migrations
COPY content ./content
COPY package.json ./

EXPOSE 3000
# Migraciones y seed corren en el mismo contenedor antes del servidor (D11),
# sin un contenedor one-shot que Dockge muestre como finalizado. `exec` deja
# a node como PID 1, igual que antes, en vez de colgarlo de un `sh`.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && exec node dist/server.js"]
