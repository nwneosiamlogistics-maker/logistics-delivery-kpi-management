import mariadb from 'mariadb';
import dotenv from 'dotenv';

dotenv.config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'logistics_kpi',
  connectionLimit: 10,
  acquireTimeout: 30000,
  decimalAsNumber: true,
  charset: 'utf8mb4',
});

export async function getConnection() {
  return await pool.getConnection();
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(sql, params);
    return rows as T[];
  } finally {
    if (conn) conn.release();
  }
}

export async function execute(sql: string, params?: any[]): Promise<mariadb.UpsertResult> {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(sql, params);
    return result;
  } finally {
    if (conn) conn.release();
  }
}

export default pool;
