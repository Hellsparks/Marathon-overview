FROM node:20-alpine

# better-sqlite3 needs native compilation tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Volume mount points (Docker will overlay these)
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000
CMD ["node", "src/index.js"]
