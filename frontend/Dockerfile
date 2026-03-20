FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package.json — needed by vite.config.js to read the app version
COPY package.json ./

# Install frontend deps
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine AS runtime

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
