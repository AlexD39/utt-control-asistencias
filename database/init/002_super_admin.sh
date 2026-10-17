#!/bin/sh
set -eu

if [ "${#SUPER_ADMIN_PASSWORD}" -lt 12 ]; then
  echo "SUPER_ADMIN_PASSWORD debe contener al menos 12 caracteres." >&2
  exit 1
fi

if ! printf '%s' "$SUPER_ADMIN_PASSWORD" | grep -q '[[:alpha:]]' || \
   ! printf '%s' "$SUPER_ADMIN_PASSWORD" | grep -q '[[:digit:]]'; then
  echo "SUPER_ADMIN_PASSWORD debe incluir letras y números." >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=admin_name="$SUPER_ADMIN_NAME" \
  --set=admin_email="$SUPER_ADMIN_EMAIL" \
  --set=admin_password="$SUPER_ADMIN_PASSWORD" <<-'EOSQL'
    INSERT INTO users (name, email, password_hash, role)
    VALUES (
      :'admin_name',
      lower(:'admin_email'),
      crypt(:'admin_password', gen_salt('bf')),
      'super_admin'
    );
EOSQL

echo "Superadministrador inicial creado correctamente."
