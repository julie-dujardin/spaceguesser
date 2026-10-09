# Multiplayer load test

k6 harness answering "how many players at once fit on the VPS next to search?".
`lobby-load.js` plays whole games over real sockets, one lobby per VU: create,
join, start, a guess per player per round, next, final. Closed-loop
`constant-vus` — a saturated server slows the games rather than piling up
sockets. `run-sweep.sh` restarts the server under a limit of 1/2/4 cores
(`docker update --cpus`) and sweeps the number of lobbies, in two modes:

- `play` — 500 ms think time: message throughput, which is what CPU limits.
- `hold` — 20 s think time, ten players a lobby: open sockets, which is what RAM limits.

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

On a desktop (Ryzen 9 9900X3D), over loopback, with no errors in any run.

`play`: messages in per second, and the p95 from a round's last guess to its
results.

| players | 1 core | 2 cores | 4 cores |
| --- | --- | --- | --- |
| 2,000 | 4,800 · 2 ms | 4,800 · 2 ms | 4,700 · 2 ms |
| 4,000 | 8,100 · 123 ms | 9,200 · 12 ms | 9,300 · 9 ms |
| 8,000 | 8,100 · 830 ms | 14,000 · 260 ms | 14,600 · 196 ms |

Roughly a core per 4,000 messages a second between the server and Postgres,
two thirds of it Postgres's. Four cores carry no more than two: by then the
server's CPU is not what limits the sweep.

`hold`, on one core:

| players | memory | server CPU | Postgres CPU |
| --- | --- | --- | --- |
| 1,000 | 23 MiB | 1% | 2% |
| 4,000 | 82 MiB | 2% | 4% |
| 10,000 | 198 MiB | 4% | 8% |
| 20,000 | 384 MiB | 7% | 13% |

20 KiB an open socket, near 30 at a run's fullest. The server gives none back:
its memory stays where its busiest hour left it.

**Sizing:** 20,000 players at once, each guessing every 20 s, take 600 MiB, a
fifth of a core and 1,100 commits a second, every message being one. The VPS
has 4 cores, 7.7 GB of which search wants about 1, and a disk that syncs 7,900
times a second (`pg_test_fsync` there: the sweep's Postgres is in memory, so
the sweep says nothing of it). None of the three is what limits it. The
server's own caps are: 65,536 open files in its compose file, and 2,500
lobbies of 24 players. Nothing past 20,000 players was run. Loopback numbers
on a fast core — add real network RTT.
