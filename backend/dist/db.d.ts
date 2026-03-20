import mariadb from 'mariadb';
declare const pool: mariadb.Pool;
export declare function getConnection(): Promise<mariadb.PoolConnection>;
export declare function query<T = any>(sql: string, params?: any[]): Promise<T[]>;
export declare function execute(sql: string, params?: any[]): Promise<mariadb.UpsertResult>;
export default pool;
