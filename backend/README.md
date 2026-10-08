# spaceguesser multiplayer server

The relay between the players of a game: who is in the lobby, whose turn it is
to act, when a round closes. It does not know the game. Settings, rounds and
guesses are the frontend's own JSON, passed along: the host's client draws the
rounds and every client scores its own guess, with the code solo play uses.
Fine among friends; a competitive mode would move both in here.

```sh
docker compose up --build     # from the repo root: server on :8787, Postgres on :5432
cargo test                    # with DATABASE_URL set, also the tests that need Postgres
```

Those tests each make a database of their own on the server `DATABASE_URL`
names and drop it after, so it is safe to point at the development one.

`BIND` (default `127.0.0.1:8787`), `DATABASE_URL` (unset: lobbies live in
memory only) and `ALLOWED_ORIGINS` (comma-separated; unset: any) configure it,
with `TURNSTILE_SECRET` and `TURNSTILE_REQUIRE` for [proof of a person](#proof-of-a-person).

## Protocol

One WebSocket at `/ws`, JSON text frames with a `type`. The first message a
socket sends picks its lobby:

| message | |
| --- | --- |
| `create {name, proof?}` | opens a lobby and hosts it |
| `join {code, name, proof?}` | takes a seat: in the game under way, or for the next |
| `rejoin {code, token}` | takes a seat back after a dropped socket or a redeploy |

`proof` is a Turnstile token, [where the server wants one](#proof-of-a-person).

Then, in the lobby:

| message | who | |
| --- | --- | --- |
| `settings {settings}` | host | shows the others the mode being picked |
| `start {settings, rounds}` | host | `rounds` is one JSON value per round; `settings.timer` is seconds per round, 0 for none |
| `guess {round, result}` | anyone | once per round |
| `close_round {round}` | host | closes the open round without waiting for the rest |
| `next {round}` | host | moves on from that round's results, to the next round or the end |
| `leave` | anyone | gives the seat up |

`guess`, `close_round` and `next` name the round they mean, and get `bad_phase`
when it is no longer the one in play: a second click, a guess sent again on a
new socket, or one that crossed the round closing on its own, does nothing.

The server sends three things:

- `joined {you, token}` once, first. Keep the token with the code: together
  they are the seat.
- `lobby {now, lobby}` on every change, the whole state each time:

  ```json
  {
    "code": "QBJMQ2",
    "phase": "lobby | playing | result | final",
    "host": "<player id>",
    "players": [{ "id": "…", "name": "…", "connected": true }],
    "settings": {},
    "round": { "index": 0, "total": 5, "entry": {}, "ends_at": null, "guessed": ["<player id>"] },
    "history": [{ "<player id>": {} }]
  }
  ```

  `round` is there while playing and on the result screen. `history` holds the
  finished rounds' guesses by player, so a round's guesses stay hidden until it
  closes. `ends_at` and `now` are epoch milliseconds on the server's clock.

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
  leaves, or after 20 seconds dropped. A lobby waits on 12 players at a time,
  and seats 48 in all.
- A lobby everyone has left closes at once; one with nobody connected for five
  minutes is closed.
- A socket that says nothing for 75 seconds, pings unanswered, is dropped, and
  so is one that takes nothing sent to it for 30.
- Every change is written to Postgres before it is broadcast, so a restart
  picks every game up where it was. A database that stops answering holds a
  move up for two seconds, then writes are skipped for fifteen: it costs that
  safety, not the game. A save skipped meanwhile is made up once writes are
  back. A lobby that closes meanwhile leaves its row, and rows without a lobby
  are cleared every minute.
