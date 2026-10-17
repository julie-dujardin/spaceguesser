# spaceguesser multiplayer server

The relay between the players of a game: who is in the lobby, whose turn it is
to act, when a round closes. It does not know the game. Settings, rounds and
guesses are the frontend's own JSON, passed along: the host's client draws the
rounds and every client scores its own guess, with the code solo play uses.
Fine among friends; a competitive mode would move both in here.

```sh
docker compose up --build     # from the repo root: server on :8787, its counts on :9787, Postgres on :5432
cargo test                    # with DATABASE_URL set, also the tests that need Postgres
```

Those tests each make a database of their own on the server `DATABASE_URL`
names and drop it after, so it is safe to point at the development one.

`BIND` (default `127.0.0.1:8787`), `DATABASE_URL` (unset: games live in
memory only, for development) and `ALLOWED_ORIGINS` (comma-separated; unset:
any) configure it,
with `TURNSTILE_SECRET` and `TURNSTILE_REQUIRE` for [proof of a person](#proof-of-a-person)
and `METRICS_BIND` (default `127.0.0.1:9787`) for its [metrics](#metrics).

## Protocol

One WebSocket at `/ws`, JSON text frames with a `type`. The first message a
socket sends picks its lobby:

| message | |
| --- | --- |
| `create {protocol, name, identity, proof?}` | opens a lobby and hosts it |
| `join {protocol, code, name, identity, proof?}` | takes a seat: the player's own, or a new one in the game under way or for the next |
| `rejoin {protocol, code, token}` | takes a seat back after a dropped socket or a redeploy |

`protocol` is `3`. It changes when a page of before could no longer follow the
server. A socket opened with another, or with none, is refused `bad_request`,
which such a page reads as its being out of date.

`identity` is what the browser names itself: 16 to 64 letters, digits and
hyphens, random and kept by it. A `join` that brings one already seated takes
that seat back, in any phase and however it was left, under the name it now
gives. It is stored with the seat and sent to nobody. `proof` is a Turnstile
token, [where the server wants one](#proof-of-a-person).

Then, in the lobby:

| message | who | |
| --- | --- | --- |
| `settings {settings}` | host | shows the others the mode being picked |
| `start {settings, rounds}` | host | `rounds` is one JSON value per round; `settings.timer` is seconds per round, 0 for none |
| `ready {round}` | anyone | the round is on screen, which a timed round's clock waits for |
| `guess {round, result}` | anyone | once per round |
| `close_round {round}` | host | closes the open round without waiting for the rest |
| `next {round}` | host | moves on from that round's results, to the next round or the end |
| `leave` | anyone | gives the seat up |

`ready`, `guess`, `close_round` and `next` name the round they mean, and get
`bad_phase` when it is no longer the one in play: a second click, a guess sent
again on a new socket, or one that crossed the round closing on its own, does
nothing.

The server sends four things:

- `joined {you, token}` once, first. Keep the token with the code: together
  they are the seat.
- `results {round, guesses}` once for each round that is over: `guesses` is
  what was guessed in it, by player id. It comes when the round closes, and a
  socket that opens later is sent every round so far, in order.
- `lobby {now, lobby}` on every change, the whole state but for the guesses:

  ```json
  {
    "code": "QBJMQ2",
    "phase": "lobby | playing | result | final",
    "host": "<player id>",
    "players": [{ "id": "…", "name": "…", "connected": true }],
    "settings": {},
    "round": { "index": 0, "total": 5, "entry": {}, "ends_at": null, "guessed": ["<player id>"] },
    "finished": 0
  }
  ```

  `round` is there while playing and on the result screen. `finished` counts
  the rounds that are over: each one's `results` came ahead of the first
  `lobby` to count it, so a round's guesses stay hidden until it closes. A
  `start` sets it back to 0, and the rounds told before it are the last
  game's. `ends_at` and `now` are epoch milliseconds on the server's clock.
  `ends_at` is null on a timed round whose clock has yet to start: the round
  is told, but not to be shown.

- `error {code}`: `not_found`, `full`, `not_host`, `bad_phase`,
  `bad_request`, `already_guessed`, `busy`, `unverified`.

## Proof of a person

With `TURNSTILE_SECRET` set, the server checks the `proof` of a `create` or a
`join` with Cloudflare, and `TURNSTILE_REQUIRE` says which of the two is
refused, `unverified`, without one that holds:

| `TURNSTILE_REQUIRE` | `create` | `join` |
| --- | --- | --- |
| unset | checked and logged | checked and logged |
| `create` | required | checked and logged |
| `create,join` | required | required |

- A token is good once, for five minutes, and for the opening it was made
  for: every lobby opened and every seat taken costs a challenge.
- `rejoin` takes none. The seat's token was handed to whoever got in.
- What the server can refuse by itself it refuses first, so a name it will not
  take or a server at its lobby cap costs nobody a token.
- A required `join` is refused before its code is looked up, so codes cannot
  be tried without proof.
- A proof that cannot be checked gets in: Cloudflare not answering in three
  seconds is logged as an error and costs the check, not the game. No proof at
  all is never that.
- A secret Cloudflare does not know is not that either. The server asks at
  startup and does not start on one: it would let every made-up token in.
- 32 proofs are checked at once. A required one with no turn inside two
  seconds is refused, `busy`: a flood of tokens is turned away, not let in.
- A proof nothing requires is checked behind the opening it came with, which
  does not wait for the answer.
- Every `create` and `join` without a proof that held is logged, `no proof of
  a person`, with why and whether it was refused: what to read before
  requiring more.

Cloudflare's [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
work on localhost: `1x0000000000000000000000000000000AA` as the secret passes
every token, `2x0000000000000000000000000000000AA` none.

A socket whose seat's token opened another one is closed with status 4000,
and must not take the seat straight back: the two would trade it forever. Any
other close, 1000 included, is one to `rejoin` after.

## Rules

- A timed round's clock starts once everyone connected has the round on
  screen, or five seconds after it is told: a device that loads it first does
  not get the time a slower one spends on it, and a slow one holds the others
  up that long at most.
- A round closes when everyone has guessed, when its timer runs out (plus two
  seconds for a last guess in flight), or when the host closes it.
- A dropped socket keeps its seat, and for 20 seconds its round waits for it
  and its hosting stays with it. After that the round closes without it and
  the next player in hosts. A restart starts that clock afresh for everyone.
- A game under way takes new players, from the round it is on. One that is
  over seats them for the next.
- A seat that was in the game stays, left or dropped, with its name on the
  scoreboard, until the next `start`, which keeps only who is there. A seat
  waiting for a game, before the first or after the last, is cleared when it
  leaves, or after 20 seconds dropped. A lobby waits on 24 players at a time,
  and seats 96 in all.
- A lobby everyone has left closes at once; one with nobody connected for five
  minutes is closed.
- A socket that says nothing for 75 seconds, pings unanswered, is dropped, and
  so is one that takes nothing sent to it for 30.
- The server opens 20,000 lobbies and 60,000 sockets. Past the first a
  `create` is refused, `busy`; past the second a socket is, with a 503.
- A lobby holds in memory what every message needs: its seats, its phase, the
  round in play and who has guessed. The game's other rounds and every guess
  are in Postgres, and read back when they are relayed: a round as it opens,
  guesses as their round closes and for a socket that opens later.
- Every change is written to Postgres before it is broadcast, so a restart
  picks every game up where it was. A database that stops answering holds a
  move up for two seconds, then is left alone for fifteen. The round in play
  goes on meanwhile: guesses are taken and held, and saved once the database
  is back. What is read from it waits until then: a round's results, and the
  round after, which a `next` is refused, `busy`, while guesses are held. A
  lobby that closes meanwhile leaves its row, and rows without a lobby are
  cleared every minute.

## Metrics

`METRICS_BIND` is a second listener that answers `/metrics` and nothing else,
in the text Prometheus reads. It is apart from `BIND` because whatever is
served there is public.

| metric | |
| --- | --- |
| `spaceguesser_lobbies` | lobbies open, out of `spaceguesser_max_lobbies` |
| `spaceguesser_sockets` | sockets open: the players connected, out of `spaceguesser_max_sockets` |
| `spaceguesser_proofs_total{action, proof}` | what the proof of each `create` and `join` was found to be: `held`, `absent`, `refused` or `unchecked` |
| `spaceguesser_errors_total{code}` | every `error` sent |
| `spaceguesser_store_failures_total` | reads and writes Postgres did not take |
| `process_*` | the process's memory, CPU time, open files and start time |

Every series is there from the start, at zero, so a rate sees the first event
too. Nothing is counted by lobby or by player.

What is worth an alert:

- `up == 0`, with a probe of the public `/healthz` beside it: a scrape does
  not go through the tunnel.
- `increase(spaceguesser_proofs_total{proof="unchecked"}[10m]) > 0`:
  Cloudflare cannot be asked, and those proofs are getting in.
- `increase(spaceguesser_store_failures_total[10m]) > 0`: games are not being
  saved, and rounds are waiting on their results.
- `spaceguesser_lobbies / spaceguesser_max_lobbies > 0.8`, the same of the
  sockets, or any `busy` among the errors: the server is close to a cap, or
  at it.
- `not_found` among the errors at a rate nobody types at: codes are being
  tried.
- `changes(process_start_time_seconds[1h]) > 2`: the server keeps restarting.
