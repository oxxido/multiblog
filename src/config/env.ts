import { z } from "zod";

const envSchema = z.object({
  BASE_DOMAIN: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  MEDIA_DIR: z.string().min(1).default("./data/media"),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
