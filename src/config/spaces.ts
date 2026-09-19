export interface SpaceConfig {
  slug: string;
  name: string;
  contentDir: string;
}

// Mapa mínimo mientras no hay base de datos (S1). S3 reemplaza esto por una
// consulta a la tabla `spaces`; el middleware que lo consume no cambia.
export const spaces: Record<string, SpaceConfig> = {
  nutricion: {
    slug: "nutricion",
    name: "Nutrición",
    contentDir: "content/nutricion",
  },
  ideas: {
    slug: "ideas",
    name: "Ideas",
    contentDir: "content/ideas",
  },
};

export function resolveSpace(subdomain: string): SpaceConfig | undefined {
  return spaces[subdomain];
}
