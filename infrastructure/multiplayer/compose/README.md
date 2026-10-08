# spaceguesser multiplayer infra

The multiplayer server + Postgres + cloudflared, deployed via docker-compose.

The game has no host port: the only public path is the in-stack Cloudflare
tunnel (which also terminates TLS) → `multiplayer:8787`. The server answers
`/ws` and `/healthz` there, and refuses sockets from origins outside
`ALLOWED_ORIGINS`. Its [metrics](../../../backend/README.md#metrics) are on a
port of their own, 9787, which the tunnel must not be routed to. With
`TURNSTILE_SECRET` and `TURNSTILE_REQUIRE=create`, opening a lobby takes a
Turnstile token, and with `create,join` so does joining one: the server's
[README](../../../backend/README.md#proof-of-a-person) has the settings.

Postgres holds games in progress only, one row per lobby, so a redeploy does
not end them: the new process reads the rows back and players reconnect into
the round they left. A lobby everyone has left, or that nobody has been
connected to for five minutes, is closed and its row deleted.

## Deploy

1. Create a remotely-managed tunnel (Zero Trust > Networks > Tunnels) with a
   public hostname routed to `http://multiplayer:8787`, and copy its token.
2. Create a Turnstile widget (Turnstile > Add widget) in Managed mode, for the
   hostname the game is served from, with pre-clearance left off: it sets a
   cookie, and the privacy page says there are none. The widget's sitekey is
   the `PUBLIC_TURNSTILE_SITEKEY` variable of the site's Worker, set in the
   Cloudflare dashboard; its secret key goes in `.env`.
3. `cp .env.example .env` and fill it in. Leave `TURNSTILE_REQUIRE` empty until
   the site is live with the sitekey: a page without it has no proof to give,
   and opens no lobby on a server that requires one.
4. Bring up the stack.
5. Add a rate limiting rule (the zone > Security > Security rules > Create
   rule > Rate limiting rules) on `http.request.uri.path eq "/ws"`: 100
   requests per 10 seconds per IP, block for 10 seconds. A free plan's rule
   matches on the path alone, so it counts `/ws` on every hostname of the
   zone. A proof guards what a socket may open, not the opening of sockets;
   this does. A player reconnecting opens five in ten seconds, so it leaves
   room for twenty behind one address.
6. Let Prometheus read `http://<host>:9787/metrics` over the tailnet. The port
   is published on the host's loopback, and
   `tailscale serve --bg --tcp=9787 tcp://localhost:9787` passes it on to the
   tailnet, after a reboot too. `METRICS_HOST` set to the host's tailnet
   address publishes it there without that, but Docker then fails to start
   the server on a boot where it comes up before Tailscale has the address.
   Either way never on `0.0.0.0`: Docker opens a published port past the
   host's firewall.

The image is built and pushed to GHCR by the `backend` workflow on every push
to `main` that touches `backend/`. To ship one, pull and recreate:

```
docker compose pull multiplayer && docker compose up -d multiplayer
```

Open sockets drop; a client gets its seat back with `rejoin`.
