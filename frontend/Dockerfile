# 镜像源说明：
# - 基础镜像：直接使用官方镜像名，由 Docker daemon 加速器自动接管
#   (daemon 已配置 docker.1ms.run / docker.xuanyuan.me，避免与显式前缀混用导致缓存不命中)
# - Alpine 包源：mirrors.aliyun.com（阿里云镜像站）
# - npm 包源：registry.npmmirror.com（淘宝 NPM 镜像站）
# - BuildKit 缓存挂载：npm 下载跨构建复用，大幅加速重复构建

# syntax 指令启用 BuildKit 扩展功能（--mount=type=cache）
# syntax=docker/dockerfile:1

# ---------- 阶段 1：builder（编译前端）----------
FROM node:22-alpine AS builder

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmmirror.com && \
    npm ci
COPY . .
RUN npm run build

# ---------- 阶段 2：runtime（nginx 静态服务）----------
FROM nginx:alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
