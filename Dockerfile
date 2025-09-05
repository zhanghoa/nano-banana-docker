# Dockerfile (推荐版本)

# --- Stage 1: Build & Cache ---
# 使用一个明确、稳定且支持多架构的官方 Deno 镜像。
# 1.44.4 是一个很好的选择，它与 std@0.224.0 兼容。
FROM denoland/deno:1.44.4 as builder

WORKDIR /app

# 优化构建缓存：
# 只复制最可能影响依赖的文件（通常是 import map 或主文件）。
# 这样，修改静态文件或业务逻辑时，不会触发依赖的重新下载。
COPY main.ts .

# 自动缓存：
# 让 Deno 自己去分析 main.ts 并下载所有需要的依赖，无需手动维护列表。
# 这更加健壮和自动化。
RUN deno cache main.ts

# 复制应用程序的其余部分。
COPY static ./static


# --- Stage 2: Final Image ---
# 使用相同的 Deno 版本作为运行环境，确保一致性。
FROM denoland/deno:1.44.4

WORKDIR /app

# 安全最佳实践：使用非 root 用户运行。
USER deno

# 从构建阶段复制所有必要的文件，包括缓存的依赖和源码。
COPY --from=builder --chown=deno:deno /deno-dir/ /deno-dir/
COPY --from=builder --chown=deno:deno /app/ .

# 暴露端口。
EXPOSE 8088

# 正确的运行命令：
# - 包含了所有必要的权限，特别是 --allow-env。
# - 不需要 --cached-only，因为依赖已经在镜像里了，Deno 不会再去联网下载。
CMD ["run", "--allow-net", "--allow-read", "--allow-env", "main.ts"]
