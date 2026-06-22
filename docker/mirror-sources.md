# Docker 国内镜像源配置文档

## 概述

本文档记录 Hanxing-image 项目 Docker 构建过程中使用的国内镜像源配置及其可靠性评估，确保在不依赖境外网络的情况下能够完整构建。

---

## 一、镜像源配置清单

### 1. Docker 基础镜像（FROM 指令）

| 镜像源 | 地址 | 用途 | 可靠性 | 说明 |
|--------|------|------|--------|------|
| **DaoCloud（主用）** | `docker.m.daocloud.io` | Docker Hub 镜像代理 | ★★★★★ | 国内知名云服务商，企业级稳定性，长期维护 |
| 1ms.run（备选） | `docker.1ms.run` | Docker Hub 镜像代理 | ★★★☆☆ | 社区维护，速度快但稳定性一般 |
| DockerPull（备选） | `dockerpull.org` | Docker Hub 镜像代理 | ★★★☆☆ | 社区维护，可用性波动 |
| Rat.dev（备选） | `hub.rat.dev` | Docker Hub 镜像代理 | ★★★☆☆ | 社区维护，可用性波动 |

**当前使用方式：** 在 Dockerfile 的 FROM 指令中直接使用 `docker.m.daocloud.io/library/` 前缀拉取镜像。

```dockerfile
# 示例
FROM docker.m.daocloud.io/library/node:22-alpine
FROM docker.m.daocloud.io/library/nginx:alpine
```

**备选切换方式：** 若主用源不可用，替换 FROM 指令中的前缀即可：
- `docker.m.daocloud.io/library/` → `docker.1ms.run/library/`
- `docker.m.daocloud.io/library/` → `dockerpull.org/library/`

### 2. Alpine Linux 包管理器（apk）

| 镜像源 | 地址 | 可靠性 | 说明 |
|--------|------|--------|------|
| **阿里云镜像站（主用）** | `mirrors.aliyun.com` | ★★★★★ | 阿里云官方维护，稳定可靠，同步及时 |
| 清华大学镜像站（备选） | `mirrors.tuna.tsinghua.edu.cn` | ★★★★★ | 清华官方维护，教育网速度极佳 |
| 中科大镜像站（备选） | `mirrors.ustc.edu.cn` | ★★★★☆ | 中科大官方维护，稳定性好 |

**当前配置方式：** 在 Dockerfile 中通过 sed 替换 apk 仓库地址。

```dockerfile
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
```

**备选切换：**
```dockerfile
# 清华源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
# 中科大源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
```

### 3. npm 包管理器

| 镜像源 | 地址 | 可靠性 | 说明 |
|--------|------|--------|------|
| **淘宝 NPM 镜像站（主用）** | `https://registry.npmmirror.com` | ★★★★★ | 阿里云官方维护，原 cnpmjs.org 继任者，同步频率 10 分钟 |
| 腾讯云镜像站（备选） | `https://mirrors.cloud.tencent.com/npm/` | ★★★★☆ | 腾讯云官方维护 |
| 华为云镜像站（备选） | `https://repo.huaweicloud.com/repository/npm/` | ★★★★☆ | 华为云官方维护 |

**当前配置方式：** 在 Dockerfile 中通过 npm config 设置。

```dockerfile
RUN npm config set registry https://registry.npmmirror.com && npm ci
```

### 4. sharp 预编译二进制文件

| 镜像源 | 地址 | 可靠性 | 说明 |
|--------|------|--------|------|
| **淘宝镜像站（主用）** | `https://registry.npmmirror.com/-/binary/sharp-libvips` | ★★★★★ | 淘宝 NPM 镜像站提供的 sharp-libvips 二进制加速 |

**当前配置方式：** 通过环境变量指定。

```dockerfile
ENV SHARP_LIBVIPS_NPM_API_MIRROR=https://registry.npmmirror.com/-/binary/sharp-libvips
```

### 5. Docker Daemon 镜像加速

| 配置项 | 值 | 说明 |
|--------|------|------|
| registry-mirrors | `https://docker.m.daocloud.io` | 主用，DaoCloud 镜像加速 |
| registry-mirrors | `https://docker.1ms.run` | 备选1 |
| registry-mirrors | `https://dockerpull.org` | 备选2 |
| registry-mirrors | `https://hub.rat.dev` | 备选3 |

**配置文件位置：** `docker/daemon.json`

**部署方式：**
```bash
# Linux 系统
sudo mkdir -p /etc/docker
sudo cp docker/daemon.json /etc/docker/daemon.json
sudo systemctl restart docker

# Windows 系统 (Docker Desktop)
# 打开 Docker Desktop → Settings → Docker Engine
# 将 daemon.json 内容粘贴到配置中 → Apply & Restart
```

---

## 二、优化变更记录

### Backend Dockerfile 变更

| 变更项 | 优化前 | 优化后 |
|--------|--------|--------|
| 基础镜像源 | `docker.1ms.run` | `docker.m.daocloud.io` |
| sharp 二进制下载 | 未配置（默认从 GitHub 下载） | 配置 `SHARP_LIBVIPS_NPM_API_MIRROR` 环境变量 |
| 镜像源注释 | 无 | 添加国内镜像源说明注释 |

### Frontend Dockerfile 变更

| 变更项 | 优化前 | 优化后 |
|--------|--------|--------|
| 基础镜像源 | `docker.1ms.run` | `docker.m.daocloud.io` |
| Alpine apk 源（builder 阶段） | 未配置 | 配置 `mirrors.aliyun.com` |
| Alpine apk 源（nginx 阶段） | 未配置 | 配置 `mirrors.aliyun.com` |
| 镜像源注释 | 无 | 添加国内镜像源说明注释 |

### 新增文件

| 文件 | 说明 |
|------|------|
| `docker/daemon.json` | Docker Daemon 镜像加速配置，含多源备选 |

---

## 三、纯国内网络构建验证清单

在不依赖境外网络的情况下，构建过程涉及的所有网络请求：

- [x] **Docker 基础镜像拉取** — `docker.m.daocloud.io`（国内 DaoCloud 镜像代理）
- [x] **Alpine 包安装** — `mirrors.aliyun.com`（阿里云镜像站）
- [x] **npm 依赖安装** — `registry.npmmirror.com`（淘宝 NPM 镜像站）
- [x] **sharp 预编译二进制下载** — `registry.npmmirror.com/-/binary/sharp-libvips`（淘宝镜像站）
- [x] **构建产物复制** — 纯本地操作，无网络依赖

**结论：** 优化后的构建清单所有网络请求均指向国内镜像源，可在纯国内网络环境下完成构建。

---

## 四、故障切换指南

若主用镜像源不可用，按以下优先级切换：

### Docker 基础镜像
1. `docker.m.daocloud.io` → `docker.1ms.run` → `dockerpull.org` → `hub.rat.dev`
2. 修改 Dockerfile 中所有 FROM 指令的前缀即可

### Alpine 包管理器
1. `mirrors.aliyun.com` → `mirrors.tuna.tsinghua.edu.cn` → `mirrors.ustc.edu.cn`
2. 修改 Dockerfile 中 sed 替换的目标域名

### npm 包管理器
1. `registry.npmmirror.com` → `mirrors.cloud.tencent.com/npm/` → `repo.huaweicloud.com/repository/npm/`
2. 修改 Dockerfile 中 `npm config set registry` 的地址
