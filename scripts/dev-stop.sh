#!/bin/sh
# Stop only services with verified lifecycle state; never kill an arbitrary port owner.
. "$(dirname -- "$0")/dev-common.sh"
run_lifecycle stop "$@"
