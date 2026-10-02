# Multiplayer load test

k6 harness answering "how many players at once fit on the VPS next to search?".
`lobby-load.js` plays whole games over real sockets, one lobby per VU: create,
join, start, a guess per player per round, next, final. Closed-loop
`constant-vus` — a saturated server slows the games rather than piling up
sockets. `run-sweep.sh` CPU-limits the container (`docker update --cpus`) to
1/2/4 cores and sweeps the number of lobbies, in two modes:

- `play` — 500 ms think time: message throughput, which is what CPU limits.
- `hold` — 20 s think time, many lobbies: open sockets, which is what RAM limits.

```bash
docker compose up -d --build        # from the repo root: server + Postgres
./run-sweep.sh play                 # or: hold
```

Each line reports games finished, messages per second each way, the latency
from a round's last guess to every player seeing its results (a store write and
a broadcast), and the container's CPU and memory sampled mid-run. Memory over
the player count is what a connection costs.

## Results

Not run yet.
