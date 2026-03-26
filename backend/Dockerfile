FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends git smbclient && rm -rf /var/lib/apt/lists/*

# Copy docker CLI + compose plugin from official image so the update route
# can run `docker compose pull && up` against the host socket.
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

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
