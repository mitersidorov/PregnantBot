FROM node:24-alpine AS backend-build
WORKDIR /workspace/apps/backend
COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci
COPY apps/backend/ ./
RUN npm run build

FROM node:24-alpine AS webapp-build
WORKDIR /workspace/apps/webapp
COPY apps/webapp/package.json apps/webapp/package-lock.json ./
RUN npm ci
COPY apps/webapp/ ./
RUN npm run build

FROM node:24-alpine AS runtime
RUN apk add --no-cache nginx gettext-envsubst supervisor
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=backend-build /workspace/apps/backend/package.json ./package.json
COPY --from=backend-build /workspace/apps/backend/package-lock.json ./package-lock.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-build --chown=node:node /workspace/apps/backend/dist ./dist
COPY --from=webapp-build /workspace/apps/webapp/dist/pregnantbot-webapp/browser /usr/share/nginx/html
COPY docker/nginx/monolith.conf.template /etc/nginx/http.d/monolith.conf.template
COPY docker/monolith-supervisord.conf /etc/supervisord.conf
COPY docker/monolith-start.sh /usr/local/bin/monolith-start
RUN chmod 0755 /usr/local/bin/monolith-start \
    && rm -f /etc/nginx/http.d/default.conf \
    && mkdir -p /run/nginx /var/lib/nginx/tmp \
    && chown -R node:node /app
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1/api/health',{headers:{'X-Telegram-Init-Data':'invalid'}}).then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/monolith-start"]
