#!/bin/sh
# Report the live/down status of all five dev servers.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$REPO_ROOT/scripts/pids"

check_app() {
  name="$1"
  pkg="$2"
  port="$3"

  port_pid=$(lsof -ti tcp:"$port" 2>/dev/null)

  if [ -n "$port_pid" ]; then
    status="UP  "
    detail="PID $port_pid  →  http://localhost:$port"
  else
    status="DOWN"
    detail="nothing listening on :$port"

    pid_file="$PID_DIR/$pkg.pid"
    if [ -f "$pid_file" ]; then
      stale_pid=$(cat "$pid_file")
      detail="$detail  (stale PID file: $stale_pid)"
    fi
  fi

  printf "  %-6s  %s  %s\n" "$status" "$name" "$detail"
}

echo ""
echo "Service status:"
echo ""

check_app "Northwind Retail (merchant-web)      " "merchant-web"      3000
check_app "Acme Payments consumer (payment-user-web)  " "payment-user-web"  3001
check_app "Acme Payments admin   (payment-admin-web)  " "payment-admin-web" 3002
check_app "Acme Payments API     (payment-api)        " "payment-api"       3003
check_app "Acme Assist chatbot   (chatbot-agent)      " "chatbot-agent"     3004

echo ""
