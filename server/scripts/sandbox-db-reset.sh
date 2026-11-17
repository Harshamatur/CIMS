#!/usr/bin/env bash
# SANDBOX ONLY helper: recreates a throwaway local database named cims_test and applies the SQL migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
PW=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
su postgres -c "psql -v ON_ERROR_STOP=1 -q -c 'DROP DATABASE IF EXISTS cims_test' -c 'DROP ROLE IF EXISTS cims_test_user' -c \"CREATE ROLE cims_test_user LOGIN PASSWORD '$PW'\" -c 'CREATE DATABASE cims_test OWNER cims_test_user'"
printf 'TEST_DATABASE_URL=postgresql://cims_test_user:%s@127.0.0.1:5432/cims_test\n' "$PW" > .env.test.local
chmod 600 .env.test.local
URL="postgresql://cims_test_user:$PW@127.0.0.1:5432/cims_test"
for f in prisma/migrations/*/migration.sql; do echo "applying $f"; psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "$URL" -Atc "select 'tables', count(*) from information_schema.tables where table_schema='public'" -c "select 'check constraints', count(*) from pg_constraint where conname like 'chk_%'" -c "select 'triggers', count(*) from pg_trigger where tgname like 'trg_%'"
