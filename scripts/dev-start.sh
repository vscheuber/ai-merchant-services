#!/bin/sh
# Start all five dev servers in the background.
# Already-running ports are skipped. Logs go to logs/<app>.log.
# PIDs are written to scripts/pids/<app>.pid for use by dev-stop.sh.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
PID_DIR="$REPO_ROOT/scripts/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

start_app() {
  name="$1"   # human label
  pkg="$2"    # pnpm --filter value
  port="$3"   # port number

  if lsof -ti tcp:"$port" > /dev/null 2>&1; then
    echo "  $name  — skipping, already listening on :$port"
    return
  fi

  nohup pnpm --filter "$pkg" dev >> "$LOG_DIR/$pkg.log" 2>&1 &
  pid=$!
  echo "$pid" > "$PID_DIR/$pkg.pid"
  echo "  $name  — started (PID $pid) → http://localhost:$port  |  logs/$pkg.log"
}

echo ""
echo "Starting Acme Payments / Northwind Retail dev servers..."
echo ""

start_app "Northwind Retail (merchant-web)      " "merchant-web"      3000
start_app "Acme Payments — consumer (payment-user-web)  " "payment-user-web"  3001
start_app "Acme Payments — admin   (payment-admin-web)  " "payment-admin-web" 3002
start_app "Acme Payments — API     (payment-api)        " "payment-api"       3003
start_app "Acme Assist — chatbot   (chatbot-agent)      " "chatbot-agent"     3004

echo ""
echo "Run 'pnpm dev:status' to check service health."
echo "Run 'pnpm dev:stop'   to stop all services."
echo ""
