FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /workspace
COPY apps/webapp/package.json apps/webapp/package-lock.json ./
RUN npm ci
COPY apps/webapp/ ./
COPY docker/live-openai-e2e.mjs ./live-openai-e2e.mjs
CMD ["npm", "run", "test:e2e"]
