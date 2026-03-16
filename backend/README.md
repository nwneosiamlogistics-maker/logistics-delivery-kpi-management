# Logistics KPI API - Synology NAS Backend

REST API สำหรับระบบ Logistics KPI Management ที่รันบน Synology NAS

## Requirements

- Synology NAS with Container Manager (Docker)
- MariaDB 10 (ติดตั้งผ่าน Package Center)
- Node.js 20+ (สำหรับ development)

## Quick Setup

### 1. สร้าง Database บน MariaDB

เข้า phpMyAdmin หรือ MariaDB CLI แล้วรัน:

```sql
-- สร้าง database
CREATE DATABASE logistics_kpi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- สร้าง user สำหรับ API
CREATE USER 'logistics_api'@'%' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON logistics_kpi.* TO 'logistics_api'@'%';
FLUSH PRIVILEGES;

-- รัน schema
USE logistics_kpi;
SOURCE /path/to/schema.sql;
```

หรือ copy เนื้อหาจาก `src/schema.sql` ไปรันใน phpMyAdmin

### 2. Deploy บน NAS ด้วย Container Manager

1. Copy folder `backend` ไปยัง NAS (เช่น `/volume1/docker/logistics-api/`)
2. สร้าง `.env` file:
   ```
   DB_HOST=192.168.1.82
   DB_PORT=3306
   DB_USER=logistics_api
   DB_PASSWORD=your_secure_password
   DB_NAME=logistics_kpi
   PORT=3001
   CORS_ORIGIN=https://logistics-delivery-kpi-management-two.vercel.app
   ```
3. เปิด Container Manager > Project > Create
4. เลือก path และ docker-compose.yml
5. Build และ Start

### 3. ตั้งค่า Reverse Proxy (HTTPS)

ใน DSM > Control Panel > Login Portal > Advanced > Reverse Proxy:

| Source | Destination |
|--------|-------------|
| `https://neosiam.DSCloud.biz:5001/api` | `http://localhost:3001` |

### 4. อัปเดต Frontend

แก้ไข `.env.local` ใน frontend:
```
VITE_API_URL=https://neosiam.DSCloud.biz:5001/api
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/deliveries` | List all deliveries |
| POST | `/api/deliveries` | Create/update delivery |
| POST | `/api/deliveries/bulk` | Bulk create/update |
| PATCH | `/api/deliveries/:orderNo` | Update specific fields |
| GET | `/api/holidays` | List holidays |
| POST | `/api/holidays` | Create holiday |
| GET | `/api/kpi-configs` | List KPI configs |
| GET | `/api/import-logs` | List import logs |
| GET | `/api/store-mappings` | List store mappings |
| GET | `/api/branch-resources` | List branch resources |

## Development

```bash
cd backend
npm install
npm run dev
```

## Migration จาก Firebase

```bash
npm run migrate
```

(ต้องตั้งค่า FIREBASE_DATABASE_URL ใน .env ก่อน)
