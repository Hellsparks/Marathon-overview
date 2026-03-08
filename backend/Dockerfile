FROM node:24-slim

# Install Python 3, pip, and CadQuery (+ a font for text rendering)
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip fonts-liberation \
    && pip3 install --break-system-packages cadquery \
    && rm -rf /var/lib/apt/lists/*

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
