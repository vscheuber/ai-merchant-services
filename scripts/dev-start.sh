#!/bin/sh
# Start owned services and wait for route-aware readiness.
. "$(dirname -- "$0")/dev-common.sh"
run_lifecycle start "$@"
