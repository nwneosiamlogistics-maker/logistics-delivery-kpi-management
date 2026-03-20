/**
 * Firebase to NAS MariaDB Migration Script
 *
 * This script migrates data from Firebase Realtime Database to MariaDB on Synology NAS.
 * Run once to transfer all data, then the system will use NAS as the single source of truth.
 *
 * Usage:
 *   1. Set environment variables (see below)
 *   2. Run: npx ts-node src/migrate-firebase-to-nas.ts
 *
 * Required Environment Variables:
 *   - FIREBASE_API_KEY
 *   - FIREBASE_AUTH_DOMAIN
 *   - FIREBASE_DATABASE_URL
 *   - FIREBASE_PROJECT_ID
 *   - DB_HOST (NAS IP, e.g., 192.168.1.82)
 *   - DB_PORT (default 3306)
 *   - DB_USER (e.g., logistics_api)
 *   - DB_PASSWORD (e.g., LogisticsKPI2026!)
 *   - DB_NAME (e.g., logistics_kpi)
 */
export {};
