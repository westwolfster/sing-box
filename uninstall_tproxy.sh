#!/bin/bash
# ==========================================
# sing-box TProxy nftables 卸载脚本
# 适配系统: Debian 12 / Ubuntu 22.04+
# 作者: ChatGPT (李玉龙环境定制版)
# ==========================================

set -e

echo "=== [1/5] 停止 sing-box 服务 ==="
if systemctl is-active --quiet sing-box; then
    systemctl stop sing-box
fi

echo "=== [2/5] 禁用 sing-box 开机启动 ==="
if systemctl is-enabled --quiet sing-box; then
    systemctl disable sing-box
fi

echo "=== [3/5] 删除 nftables 配置文件 ==="
NFT_FILE="/etc/nftables.d/singbox_tproxy.nft"
if [ -f "$NFT_FILE" ]; then
    echo "删除 $NFT_FILE"
    rm -f "$NFT_FILE"
fi

echo "=== [4/5] 清空 nftables 当前规则 ==="
nft flush ruleset
echo "规则已清空。"

echo "=== [5/5] 删除 systemd 服务文件 ==="
SERVICE_FILE="/etc/systemd/system/sing-box.service"
if [ -f "$SERVICE_FILE" ]; then
    echo "删除 $SERVICE_FILE"
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload
fi

echo "=== 卸载完成 ==="
echo "建议执行以下命令验证:"
echo "  nft list ruleset"
echo "  systemctl list-unit-files | grep sing-box"
