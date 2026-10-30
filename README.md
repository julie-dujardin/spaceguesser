# Spaceguesser

You're standing somewhere in the solar system. Look around to figure out where you are, and place your guess on the map. This is like GeoGuessr, but the playing area is the entire solar system.

**Play now at [spaceguesser.com](https://spaceguesser.com)**

This game is built on top of 14k ground panoramas, most provided by NASA: their Mars rovers can generally navigate to a point autonomously, but rarely choose their targets. These panoramas are used by scientists to identify interesting locations, or when manual control is needed.

Playing with just Mars would be boring. About half of rounds will be played on orbital views provided by the [SpaceMap SDK](https://spacemap.co), which can render all mapped worlds in the solar system. 

| ![Ground panorama round](documentation/images/ground-round.png) | ![Orbit round](documentation/images/orbit-round.png) |
|:-:|:-:|

Game modes: Start with the tutorial, then go for the daily challenge or quick play. Play with your friends by starting a multiplayer lobby and sharing the code.

No accounts needed, all data stays local during solo play. In multiplayer, all data is deleted after the end of the game.

## Architecture 

This game is built with the [SpaceMap SDK](https://www.npmjs.com/package/spacemap), which is free to use.

- `frontend/`: the game, in React and TypeScript, hosted on Cloudflare Workers.
- `backend/`: the Rust server behind multiplayer and the daily challenge, with Postgres. It only relays lobbies over WebSockets: the host's browser draws the rounds, and each browser scores its own guess. Its [README](backend/README.md) has the protocol.
- `infrastructure/`: the Cloudflare deploy config, the [server's deployment](infrastructure/multiplayer/compose/README.md) on a VPS behind a Cloudflare tunnel, and its load test.

## Dev setup

```sh
cd frontend
pnpm install
pnpm dev
```

That's all solo play needs. Multiplayer and the daily challenge need the server:

```sh
docker compose up --build   # the server and Postgres, on :8787
echo 'PUBLIC_MULTIPLAYER_URL=ws://127.0.0.1:8787/ws' > frontend/.env
```

The daily challenge files contain the answers, so they aren't in the repo: it stays unavailable until `dailies/<YYYY-MM-DD>.json` exists.
