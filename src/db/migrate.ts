import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, db } from "./client.js";

// Usa el migrador de drizzle-orm (dependencia de runtime) en vez de
// drizzle-kit para que la imagen de producción no cargue devDependencies.
// Lee la misma tabla drizzle.__drizzle_migrations que drizzle-kit, así que
// las migraciones ya aplicadas por el viejo contenedor `migrate` no se repiten.
await migrate(db, { migrationsFolder: "src/db/migrations" });
await closeDb();
