#!/bin/bash
/usr/local/mariadb10/bin/mysql -u root <<EOF
CREATE USER IF NOT EXISTS 'logistics_api'@'%' IDENTIFIED BY 'LogisticsKPI2026';
GRANT ALL PRIVILEGES ON logistics_kpi.* TO 'logistics_api'@'%';
FLUSH PRIVILEGES;
SELECT User, Host FROM mysql.user WHERE User='logistics_api';
EOF
