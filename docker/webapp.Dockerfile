FROM node:22-alpine AS build
WORKDIR /workspace/apps/webapp
COPY apps/webapp/package.json apps/webapp/package-lock.json ./
RUN npm ci
COPY apps/webapp/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /workspace/apps/webapp/dist/pregnantbot-webapp/browser /usr/share/nginx/html
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=API_KEY
EXPOSE 80
