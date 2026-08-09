# 镜像源说明：
# - 基础镜像：直接使用官方镜像名，由 Docker daemon 加速器自动接管
#   (daemon 已配置 docker.1ms.run / docker.xuanyuan.me，避免与显式前缀混用导致缓存不命中)
# - Alpine 包源：mirrors.aliyun.com（阿里云镜像站）
# - npm 包源：registry.npmmirror.com（淘宝 NPM 镜像站）
# - BuildKit 缓存挂载：apk 与 npm 下载跨构建复用，大幅加速重复构建

# syntax 指令启用 BuildKit 扩展功能（--mount=type=cache）
# syntax=docker/dockerfile:1

# ---------- 阶段 1：deps（仅生产依赖）----------
FROM node:22-alpine AS deps

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app
COPY package*.json ./
ENV SHARP_LIBVIPS_NPM_API_MIRROR=https://registry.npmmirror.com/-/binary/sharp-libvips
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmmirror.com && \
    npm ci --omit=dev

# ---------- 阶段 2：builder（编译源码）----------
FROM node:22-alpine AS builder

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmmirror.com && \
    npm ci
COPY . .
RUN npm run build

# ---------- 阶段 3：runtime（运行镜像）----------
FROM node:22-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

WORKDIR /app

# 直接复用 deps 阶段的生产依赖，运行阶段无需重新 npm ci，也无需编译工具
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN mkdir -p uploads data

EXPOSE 3001
CMD ["node", "dist/index.js"]
