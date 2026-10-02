# spaceguesser multiplayer infra

The multiplayer server + Postgres + cloudflared, deployed via docker-compose.

Nothing has a host port: the only public path is the in-stack Cloudflare tunnel
(which also terminates TLS) → `multiplayer:8787`. The server answers `/ws` and
`/healthz`, and refuses sockets from origins outside `ALLOWED_ORIGINS`.

Postgres holds games in progress only, one row per lobby, so a redeploy does
not end them: the new process reads the rows back and players reconnect into
the round they left. A lobby everyone has left, or that nobody has been
connected to for five minutes, is closed and its row deleted.

## Deploy

1. Create a remotely-managed tunnel (Zero Trust > Networks > Tunnels) with a
   public hostname routed to `http://multiplayer:8787`, and copy its token.
2. `cp .env.example .env` and fill it in.
3. Bring up the stack.

The image is built and pushed to GHCR by the `backend` workflow on every push
to `main` that touches `backend/`. To ship one, pull and recreate:

```
docker compose pull multiplayer && docker compose up -d multiplayer
```

Open sockets drop; a client gets its seat back with `rejoin`.
