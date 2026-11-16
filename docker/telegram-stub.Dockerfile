FROM node:22-alpine
WORKDIR /app
COPY docker/telegram-stub.mjs ./telegram-stub.mjs
ENV PORT=8080
EXPOSE 8080
CMD ["node", "telegram-stub.mjs"]
