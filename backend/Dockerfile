FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Volume mount points (Docker will overlay these)
RUN mkdir -p /app/data /app/uploads

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

EXPOSE 3000
CMD ["node", "src/index.js"]
