#!/usr/bin/env bash
# İlk kurulumda ek veritabanları: keycloak (kimlik) + veritut_tfstate (D11 — yalnız runner rolü).
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE ROLE keycloak LOGIN PASSWORD '${KC_DB_PASSWORD}';
  CREATE DATABASE keycloak OWNER keycloak;
  CREATE ROLE tfstate LOGIN PASSWORD '${TFSTATE_DB_PASSWORD}';
  CREATE DATABASE veritut_tfstate OWNER tfstate;
SQL
