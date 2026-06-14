import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

const { Pool } = pg;

// Connection pool configuration following the recommended Object Method
export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST || "localhost",
    user: process.env.SQL_USER || "postgres",
    password: process.env.SQL_PASSWORD || "postgres",
    database: process.env.SQL_DB_NAME || "postgres",
    port: 5432,
    connectionTimeoutMillis: 15000,
    max: 10, // Avoid resource starvation
  });
};

const pool = createPool();

// Robust idle error handling to avoid socket exceptions crashing the process
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL pool connection:", err);
});

// Primary drizzle export
export const db = drizzle(pool, { schema });
