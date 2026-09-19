import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

const queryClient = postgres(env.DATABASE_URL);

export const db = drizzle(queryClient, { schema });

// El proceso de la app vive indefinidamente y nunca llama esto; existe para
// que los tests puedan cerrar la conexión y el runner termine solo.
export async function closeDb(): Promise<void> {
  await queryClient.end();
}
