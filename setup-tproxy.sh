#!/bin/bash
set -e

# === 基础参数 ===
WAN_IF="ppp0"
LAN_IF="enp9s0"
TPROXY_PORT=60080
DNS_PORT=5353
MARK_ID=0x4000
ROUTE_TABLE_ID=100

echo "=== [1/5] 清空旧 nftables 规则 ==="
nft flush ruleset

echo "=== [2/5] 创建 nftables 规则 ==="
nft -f - <<EOF
table inet filter {
    chain input {
        type filter hook input priority 0;
        policy drop;

        iif "lo" accept
        ct state {established, related} accept
        iifname "$LAN_IF" accept
        iifname "$WAN_IF" accept
    }

    chain forward {
        type filter hook forward priority 0;
        policy drop;

        ct state {established, related} accept
        iifname "$LAN_IF" oifname "$WAN_IF" accept
        iifname "$WAN_IF" oifname "$LAN_IF" ct state {established, related} accept
    }
}

table ip nat {
    chain postrouting {
        type nat hook postrouting priority 100;
        oifname "$WAN_IF" masquerade
    }
}

table inet tproxy {
    chain prerouting {
        type filter hook prerouting priority -150;
        policy accept;

        # 忽略 loopback 和本机通信
        iif "lo" return

        # 忽略已打标流量
        meta mark $MARK_ID return

        # 忽略保留与局域网地址
        ip daddr {127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16} return

        # DNS 劫持至 sing-box
        udp dport 53 tproxy to :$DNS_PORT meta mark set $MARK_ID
        tcp dport 53 tproxy to :$DNS_PORT meta mark set $MARK_ID

        # 其他流量交给 sing-box
        tcp dport != 53 tproxy to :$TPROXY_PORT meta mark set $MARK_ID
        udp dport != 53 tproxy to :$TPROXY_PORT meta mark set $MARK_ID
    }
}
EOF

echo "=== [3/5] 设置策略路由 ==="
ip rule add fwmark $MARK_ID lookup $ROUTE_TABLE_ID || true
ip route add local 0.0.0.0/0 dev lo table $ROUTE_TABLE_ID || true

echo "=== [4/5] 持久化配置 ==="
# 保存 nftables 配置
nft list ruleset > /etc/nftables.conf

# 保存路由规则到 systemd 脚本
cat >/etc/systemd/system/tproxy-route.service <<ROUTESYS
[Unit]
Description=Sing-box TProxy Route Setup
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/ip rule add fwmark $MARK_ID lookup $ROUTE_TABLE_ID
ExecStart=/usr/sbin/ip route add local 0.0.0.0/0 dev lo table $ROUTE_TABLE_ID
ExecStop=/usr/sbin/ip rule delete fwmark $MARK_ID lookup $ROUTE_TABLE_ID
ExecStop=/usr/sbin/ip route flush table $ROUTE_TABLE_ID
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
ROUTESYS

systemctl enable tproxy-route.service

echo "=== [5/5] 启动 nftables ==="
systemctl enable nftables
systemctl restart nftables
systemctl restart tproxy-route.service

echo "✅ TProxy 环境已配置完成"
echo "✅ 当前配置摘要："
echo "   WAN:  $WAN_IF"
echo "   LAN:  $LAN_IF"
echo "   TProxy Port: $TPROXY_PORT"
echo "   DNS Port: $DNS_PORT"
echo "   fwmark: $MARK_ID"
