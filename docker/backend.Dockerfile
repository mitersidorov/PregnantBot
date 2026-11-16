FROM node:22-alpine AS build
WORKDIR /workspace/apps/backend
COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci
COPY apps/backend/ ./
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/backend/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/backend/package-lock.json ./package-lock.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /workspace/apps/backend/dist ./dist
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run migration:run:prod && node dist/main.js"]
