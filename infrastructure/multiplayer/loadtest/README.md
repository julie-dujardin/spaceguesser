# Multiplayer load test

k6 harness answering "how many players at once fit on the VPS next to search?".
`lobby-load.js` plays whole games over real sockets, one lobby per VU: create,
join, start, a guess per player per round, next, final. Closed-loop
`constant-vus` — a saturated server slows the games rather than piling up
sockets. `run-sweep.sh` restarts the server under a limit of 1/2/4 cores
(`docker update --cpus`) and sweeps the number of lobbies, in two modes:

- `play` — 500 ms think time: message throughput, which is what CPU limits.
- `hold` — 20 s think time, many lobbies: open sockets, which is what RAM limits.

```bash
docker compose up -d --build        # here: this checkout's server + Postgres, on :8788
./run-sweep.sh play                 # or: hold
```

The stack is the sweep's own. Its Postgres is in memory: a sweep is a commit
per message, and what one costs on this machine's disk says nothing of the
VPS's. Only the server is limited, so the database's CPU is reported beside it:
on the VPS they share the cores.

Each line reports games finished, messages per second each way, the latency
from a round's last guess to every player seeing its results (a store write and
a broadcast), and the server's CPU and memory sampled mid-run. Memory over the
player count is what a connection costs.

## Results

Not run yet.
