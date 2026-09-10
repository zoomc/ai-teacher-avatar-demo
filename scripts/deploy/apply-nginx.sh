#!/usr/bin/env bash
# AI Teacher Demo nginx 配置应用脚本（在 ECS 上以 sudo 运行）。
# 用法: apply-nginx.sh <remote_tmp_dir>
# <remote_tmp_dir> 内含 host/ai-teacher-demo-site.conf（已 sed 替换占位符的 location 文件）。
#
# 流程:
#   1. 移除旧的 site conf，恢复 nginx 健康（若先前注入的 include 残留导致 -t 失败，先清理）。
#   2. 用 `nginx -T` 的真实加载输出定位包含 server_name zoomlab.top 的 server 配置文件。
#   3. 幂等注入 include 到该 server block。
#   4. 安装 site conf（location 文件），nginx -t 通过后 reload。
set -eu

REMOTE_TMP="${1:?usage: apply-nginx.sh <remote_tmp_dir>}"
SITE_CONF="/etc/nginx/conf.d/ai-teacher-demo-site.conf"
INCLUDE_LINE='include /etc/nginx/conf.d/ai-teacher-demo-site.conf;'
TOOL="/usr/local/sbin/ai-teacher-demo-ensure-nginx-include"

# 1) 停用 site conf，恢复 nginx 健康
sudo rm -f "$SITE_CONF"

# 若历史注入的 include 指向已删除文件导致 nginx -t 失败，先清理所有残留 include
if ! sudo nginx -t 2>/dev/null; then
  echo "nginx unhealthy before site install; cleaning stale include lines"
  for f in $(sudo grep -Rl 'ai-teacher-demo-site.conf' /etc/nginx 2>/dev/null | grep -v '\.bak' || true); do
    sudo "$TOOL" --remove "$f" 'include /etc/nginx/conf.d/ai-teacher-demo-site.conf;' || true
  done
  sudo nginx -t
fi

# 2) 用 nginx -T 定位真实加载的 server 配置文件（跟随 include/symlink）
NGINX_SERVER_FILE="$(
  sudo nginx -T 2>/dev/null \
    | awk '/# configuration file/{f=$4} /server_name zoomlab.top/{print f}' \
    | sed 's/:$//' \
    | sort -u | head -1
)"
test -n "$NGINX_SERVER_FILE"
echo "nginx server file: $NGINX_SERVER_FILE"

# 3) 幂等注入 include 到 server block
sudo "$TOOL" "$NGINX_SERVER_FILE" 'include /etc/nginx/conf.d/ai-teacher-demo-site.conf;'

# 4) 安装 site conf 并 reload
sudo install -m 0644 "$REMOTE_TMP/host/ai-teacher-demo-site.conf" "$SITE_CONF"
sudo nginx -t
sudo systemctl reload nginx
echo "nginx applied OK"
