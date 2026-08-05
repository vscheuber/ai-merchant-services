#!/bin/sh
# Stop all five dev servers.
# Reads PIDs from scripts/pids/<app>.pid; falls back to lsof port scan.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$REPO_ROOT/scripts/pids"

stop_app() {
  name="$1"
  pkg="$2"
  port="$3"

  pid_file="$PID_DIR/$pkg.pid"

  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file" | tr -dc '0-9')
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      rm -f "$pid_file"
      echo "  $name  — stopped (PID $pid)"
      return
    else
      rm -f "$pid_file"
    fi
  fi

  # Fallback: find any process listening on the port
  pid=$(lsof -ti tcp:"$port" 2>/dev/null)
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null
    echo "  $name  — stopped via port scan (PID $pid)"
  else
    echo "  $name  — not running on :$port"
  fi
}

echo ""
echo "Stopping Acme Payments / Northwind Retail dev servers..."
echo ""

stop_app "Northwind Retail (merchant-web)             " "merchant-web"      3000
stop_app "Acme Payments — consumer (payment-user-web) " "payment-user-web"  3001
stop_app "Acme Payments — admin   (payment-admin-web) " "payment-admin-web" 3002
stop_app "Acme Payments — API     (payment-api)       " "payment-api"       3003
stop_app "Acme Assist — chatbot   (chatbot-agent)     " "chatbot-agent"     3004

echo ""
