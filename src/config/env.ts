import { z } from "zod";

const envSchema = z.object({
  BASE_DOMAIN: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
