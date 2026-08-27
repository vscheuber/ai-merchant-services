#!/bin/sh
# Report ownership, TCP, and HTTP readiness for every service.
. "$(dirname -- "$0")/dev-common.sh"
run_lifecycle status "$@"
