# syntax=docker/dockerfile:1
# GTD Workbench: one image, one volume (/data). Build on the machine that runs it, so the
# image has that machine's architecture (no multi-arch builds).
#
# NODE_VERSION must equal .nvmrc — both stages check it and the build fails otherwise.
ARG NODE_VERSION=24
ARG PNPM_VERSION=12.6.0

FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION
WORKDIR /app
RUN npm install -g pnpm@${PNPM_VERSION}
COPY .nvmrc ./
RUN test "$(node -p 'process.versions.node.split(".")[0]')" = "$(cut -d. -f1 .nvmrc)" \
  || { echo "Node $(node -v) in the image does not match .nvmrc ($(cat .nvmrc)) — set NODE_VERSION"; exit 1; }
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    STORE=sqlite \
    DATABASE_FILE=/data/gtd.db \
    TZ=Europe/Zurich \
    LOG_LEVEL=info
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts/backup.mjs ./scripts/backup.mjs
COPY --from=build /app/.nvmrc ./
# The standalone server links better-sqlite3 under a hashed name; the backup script needs
# the plain one. Then: the runtime Node must match .nvmrc, and the SQLite binding must load.
RUN cd node_modules && ln -s .pnpm/better-sqlite3@*/node_modules/better-sqlite3 better-sqlite3 && cd .. \
  && test "$(node -p 'process.versions.node.split(".")[0]')" = "$(cut -d. -f1 .nvmrc)" \
  && node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()" \
  && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
