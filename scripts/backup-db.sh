#!/bin/sh
set -eu

retention_days="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p /backups

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  temporary="/backups/.congreso_nfc_${timestamp}.dump.tmp"
  destination="/backups/congreso_nfc_${timestamp}.dump"

  if pg_dump --format=custom --no-owner --no-acl \
    --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --file "$temporary"; then
    mv "$temporary" "$destination"
    echo "Respaldo creado: $destination"
    find /backups -type f -name 'congreso_nfc_*.dump' -mtime "+$retention_days" -delete
  else
    rm -f "$temporary"
    echo "No se pudo crear el respaldo" >&2
  fi

  sleep 86400
done
