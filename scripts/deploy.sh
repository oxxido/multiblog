#!/usr/bin/env bash
set -euo pipefail

# Lo lanza GitHub Actions por SSH con `command=` en authorized_keys (D22), así
# que esa llave sólo puede ejecutar esto. Todo va dentro de main() y el `exit`
# final evita que bash siga leyendo el archivo si `git pull` lo reescribe
# mientras corre.
main() {
  cd "$(dirname "$(readlink -f "$0")")/.."

  git pull --ff-only origin master
  docker compose up -d --build

  # `up -d` devuelve 0 aunque migrate o seed fallen y el contenedor entre en
  # bucle de reinicios (D11): hay que preguntarle a la app. El Host tiene que
  # ser BASE_DOMAIN porque el middleware de espacios responde 404 al resto.
  for _ in $(seq 1 30); do
    if docker compose exec -T app sh -c \
      'wget -qO- --header "Host: $BASE_DOMAIN" http://127.0.0.1:3000/health' \
      >/dev/null 2>&1; then
      docker image prune -f >/dev/null
      echo "deploy ok"
      return 0
    fi
    sleep 2
  done

  echo "la app no respondió /health tras el deploy" >&2
  docker compose logs --tail=50 app >&2
  return 1
}

main "$@"
exit
