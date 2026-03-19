"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnection = getConnection;
exports.query = query;
exports.execute = execute;
const mariadb_1 = __importDefault(require("mariadb"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = mariadb_1.default.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'logistics_kpi',
    connectionLimit: 10,
    acquireTimeout: 30000,
    decimalAsNumber: true,
    charset: 'utf8mb4',
    initSql: "SET sql_mode='NO_ENGINE_SUBSTITUTION'",
});
async function getConnection() {
    return await pool.getConnection();
}
async function query(sql, params) {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("SET SESSION sql_mode=''");
        const rows = await conn.query(sql, params);
        return rows;
    }
    finally {
        if (conn)
            conn.release();
    }
}
async function execute(sql, params) {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("SET SESSION sql_mode=''");
        const result = await conn.query(sql, params);
        return result;
    }
    finally {
        if (conn)
            conn.release();
    }
}
exports.default = pool;
