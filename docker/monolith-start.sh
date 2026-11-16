#!/bin/sh
set -eu

: "${API_KEY:?API_KEY must be set}"
: "${PORT:=3000}"

envsubst '${API_KEY} ${PORT}' \
  < /etc/nginx/http.d/monolith.conf.template \
  > /etc/nginx/http.d/default.conf

exec supervisord -n -c /etc/supervisord.conf
