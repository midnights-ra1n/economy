FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-alpine
# Set by CI (.github/workflows/release.yml): shown in the app and used to check for newer releases.
ARG APP_VERSION=""
ARG APP_REPOSITORY=""
WORKDIR /app
ENV APP_VERSION=$APP_VERSION APP_REPOSITORY=$APP_REPOSITORY
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATA_DIR=/data PORT=3000 HOSTNAME=0.0.0.0 TZ=Europe/Paris
RUN mkdir /data && chown node:node /data && chmod 700 /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Fonts of the PDF statements (read at runtime, see lib/pdf.ts).
COPY --from=build --chown=node:node /app/assets ./assets
USER node
VOLUME /data
EXPOSE 3000
# Absolute path: some OCI runtimes (Proxmox LXC) do not apply WORKDIR.
CMD ["node", "/app/server.js"]
