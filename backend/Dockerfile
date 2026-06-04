FROM docker.1ms.run/library/node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci
COPY . .
RUN npm run build

FROM docker.1ms.run/library/node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p uploads data

EXPOSE 3001
CMD ["node", "dist/index.js"]
