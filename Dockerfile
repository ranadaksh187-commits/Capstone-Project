FROM node:24-alpine AS frontend-build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY frontend ./frontend
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY backend-node/package.json backend-node/package-lock.json ./
RUN npm ci --omit=dev
COPY backend-node/src ./src
COPY --from=frontend-build /workspace/frontend/dist ./public
ENV NODE_ENV=production
EXPOSE 8081
CMD ["npm", "start"]
