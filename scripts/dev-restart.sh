#!/bin/sh
# Preferred after-change procedure: stop, optionally clean caches, start, and wait for readiness.
. "$(dirname -- "$0")/dev-common.sh"
run_lifecycle restart "$@"
