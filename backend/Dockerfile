# 国内镜像源说明：
# - Docker基础镜像：docker.m.daocloud.io（DaoCloud镜像加速，稳定可靠）
# - 备选镜像源：docker.1ms.run / dockerpull.org / hub.rat.dev
# - Alpine包源：mirrors.aliyun.com（阿里云镜像站）
# - npm包源：registry.npmmirror.com（淘宝NPM镜像站）

FROM docker.m.daocloud.io/library/node:22-alpine AS builder

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci
COPY . .

# sharp包需要从GitHub下载预编译二进制文件，配置国内加速镜像
ENV SHARP_LIBVIPS_NPM_API_MIRROR=https://registry.npmmirror.com/-/binary/sharp-libvips
RUN npm run build

FROM docker.m.daocloud.io/library/node:22-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++ tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

WORKDIR /app
COPY package*.json ./

# 配置sharp镜像源，避免运行时重新下载
ENV SHARP_LIBVIPS_NPM_API_MIRROR=https://registry.npmmirror.com/-/binary/sharp-libvips

RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --omit=dev --prefer-offline

COPY --from=builder /app/dist ./dist
RUN mkdir -p uploads data

EXPOSE 3001
CMD ["node", "dist/index.js"]
