# 国内镜像源说明：
# - Docker基础镜像：docker.m.daocloud.io（DaoCloud镜像加速，稳定可靠）
# - 备选镜像源：docker.1ms.run / dockerpull.org / hub.rat.dev
# - Alpine包源：mirrors.aliyun.com（阿里云镜像站）
# - npm包源：registry.npmmirror.com（淘宝NPM镜像站）

FROM docker.m.daocloud.io/library/node:22-alpine AS builder

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci
COPY . .
RUN npm run build

FROM docker.m.daocloud.io/library/nginx:alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
