#!/bin/sh
set -eu
# A mounted volume hides build-time ownership. Initialize this app's mount only.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown node:node /data
  exec su-exec node:node "$@"
fi
exec "$@"
