# API image for staging (and later production). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t ricaurte-api:staging .
# No secrets are baked in: every setting comes from the runtime environment (see deploy/staging/.env.staging.example).
FROM node:24-bookworm-slim AS build
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
# Only the API and its workspace dependencies (db, domain, validation); the web app is deployed separately.
RUN corepack pnpm install --frozen-lockfile --filter "@ricaurte/api..." \
 && corepack pnpm --filter @ricaurte/db generate \
 && corepack pnpm --filter @ricaurte/api build

FROM node:24-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
RUN corepack enable
# Runtime needs: the bundle, its externals (node_modules) and Prisma (schema, migrations, CLI) for migrate deploy.
COPY --from=build --chown=node:node /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml ./
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
# Sources + tsx only for the one-off admin bootstrap (auth:bootstrap); the server runs the bundle.
COPY --from=build --chown=node:node /repo/apps/api/src ./apps/api/src
COPY --from=build --chown=node:node /repo/apps/api/tsconfig.json ./apps/api/tsconfig.json
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.mjs"]
