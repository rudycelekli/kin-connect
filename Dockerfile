FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4318 KIN_DATA_DIR=/data
RUN apk add --no-cache su-exec
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
ENTRYPOINT ["/app/bin/container-entrypoint.sh"]
EXPOSE 4318
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
