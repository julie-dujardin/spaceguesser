#!/usr/bin/env bash
# Sweep the multiplayer server across CPU allotments to size it on the VPS. Per
# CPU count, live-limit the container and ramp the number of lobbies; the point
# where round_close latency starts rising is the sustainable load, and the
# container's memory mid-run over the player count is the cost of a connection.
#
# Usage: ./run-sweep.sh [MODE] [CONTAINER]     MODE: play|hold
#   play  short think time: message throughput, which is what CPU limits
#   hold  long think time, many lobbies: open sockets, which is what RAM limits
# Env: WS_URL, CPUS, LOBBYLIST, PLAYERS, ROUNDS, DURATION
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-play}"
CONTAINER="${2:-spaceguesser-multiplayer-1}"
export WS_URL="${WS_URL:-ws://127.0.0.1:8787/ws}"
export PLAYERS="${PLAYERS:-4}"
export ROUNDS="${ROUNDS:-5}"
DURATION="${DURATION:-30}"

CPUS="${CPUS:-1 2 4}"
if [ "$MODE" = "hold" ]; then
	export THINK_MS=20000
	LOBBYLIST="${LOBBYLIST:-250 500 1000 2500 5000}"
else
	export THINK_MS=500
	LOBBYLIST="${LOBBYLIST:-50 100 250 500 1000 2000}"
fi

# Every simulated player is a socket here too.
ulimit -n 65536 2>/dev/null || echo ">> could not raise the open-file limit; large runs will fail to connect"

# quota -1 is the only reliable "unlimited" reset — `--cpus 0` is a silent no-op.
restore() {
	echo ">> restoring container to unlimited CPU"
	docker update --cpu-quota -1 "$CONTAINER" >/dev/null 2>&1 || true
}
trap restore EXIT

mkdir -p results
echo "mode=$MODE  cpus=[$CPUS]  lobbies=[$LOBBYLIST]  players/lobby=$PLAYERS  url=$WS_URL"

for c in $CPUS; do
	echo "=================================================================="
	echo ">> limiting $CONTAINER to $c CPU(s)"
	docker update --cpus "$c" "$CONTAINER" >/dev/null
	sleep 2

	for l in $LOBBYLIST; do
		tag="${MODE}_${c}c_l${l}"
		echo "-- $c CPU, $l lobbies, $((l * PLAYERS)) players"
		LOBBIES="$l" DURATION="$DURATION" TAG="$tag" \
			k6 run --quiet lobby-load.js >/dev/null 2>&1 &
		k6_pid=$!
		# Sampled with every lobby up and playing, before the run winds down.
		sleep $((DURATION * 2 / 3))
		usage="$(docker stats --no-stream --format '{{.CPUPerc}} cpu, {{.MemUsage}}' "$CONTAINER" 2>/dev/null || echo '?')"
		wait "$k6_pid" || true
		# Compact one-line readout from the JSON summary.
		python3 - "$tag" "$usage" <<'PY'
import json,sys
tag,usage=sys.argv[1],sys.argv[2]
try:
	d=json.load(open(f"results/summary_{tag}.json"))
	r=d["round_close_ms"]; j=d["join_ms"]
	print(f"   {d['games_completed'] or 0:6.0f} games | {d['msgs_sent_per_s'] or 0:6.0f} msg/s in  {d['msgs_received_per_s'] or 0:7.0f} out"
	      f" | round close p50 {r['p50'] or 0:6.1f}ms  p95 {r['p95'] or 0:6.1f}ms  p99 {r['p99'] or 0:6.1f}ms"
	      f" | join p95 {j['p95'] or 0:6.1f}ms | errors {d['errors']} | {usage}")
except Exception as e:
	print(f"   (no summary: {e})")
PY
	done
done
echo "=================================================================="
echo "done. per-run JSON in results/summary_${MODE}_*.json"
