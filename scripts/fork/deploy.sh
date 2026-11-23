#!/bin/sh
# Rebuild and restart the parallel RPG test instance (port 8092) from this checkout.
# The original openGym stack (8091) is a different compose project and is never touched.
set -e
cd /srv/stacks/opengym-rpg
docker compose build
docker compose up -d
docker compose ps
