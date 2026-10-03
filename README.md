# spaceguesser

You are somewhere in the solar system: standing on the ground in a rover's
panorama, or hanging over a body's lit side. Look around, then say where. Built
on the [Space Map](https://spacemap.co) SDK — the panorama, the Solar System you
fly in, the diagram you pick a body on, the map you pick a place on and the
flight that shows how wrong you were are all the SDK's.

Quick play, a custom solo run and multiplayer are in. The daily challenge is
not.

- `frontend/` — the game.
- `backend/` — the multiplayer server: lobbies over WebSockets, in Rust. Its
  [README](backend/README.md) has the protocol.
- `infrastructure/` — how both are deployed, and the server's load test.

```sh
cd frontend
pnpm install
pnpm dev
```

Multiplayer is there when `VITE_MULTIPLAYER_URL` names a server, and hidden
when it does not. For development:

```sh
docker compose up --build   # the multiplayer server, on :8787
echo 'VITE_MULTIPLAYER_URL=ws://127.0.0.1:8787/ws' > frontend/.env
```

## What a round is

A round is one of two kinds, a coin toss each time unless a custom run asks for
one alone.

**On the ground**, in a panorama: any the export has that the view can open
and that goes all the way round the horizon, since a partial sweep leaves out
whatever would have given the place away. That is some 4,300 of the fourteen
thousand on Mars, from Curiosity, Perseverance, Opportunity, Spirit and
InSight. The six Apollo landings, Venera 13 and Huygens' descent over Titan
play whatever their sweep: they are the only views there are of their worlds.
Yutu-2's traverse has no imagery to open. A run never draws two
stops from the same place, and never comes back to a probe within three rounds
while the pool has one to spare. The HUD shows the date the panorama was
taken; a miss is still measured at the run's date, below.

**From orbit**, in the Solar System map, over one of the 81 bodies in
`frontend/src/game/bodies.json`: every body the export has a map the game
may draw or a measured shape of, less Earth. The round happens at the run's date,
drawn within thirty days of today when the run starts and shown in the HUD, and
the place is somewhere the Sun stands at least 40° high at that date — the sky decides, so the round is drawn
as two numbers and comes out the same for everyone playing it. The camera hangs
as close as the body's map stays sharp: 1,000 km over Mars, the whole disc for
Ganymede. Whatever else is in that sky at that date is there to be seen:
Saturn and its rings from Enceladus. Names and orbits are not.

Movement is the same setting for both kinds. Free walks a panorama's traverse;
from orbit it turns the view, as look only does, and no pan or zoom is the view
straight down.

`node frontend/scripts/build-bodies.mjs` rewrites the catalogue from the
export. It also holds what the export does not say and only standing over each
body showed: the ones left out (no position at present dates, too small to
draw, lit this decade on the side never imaged), and the six under cloud, where
a map of the ground is no help.

## What a guess is

The panel in the corner walks down to it: the Solar System, then a planet's
system or one of the two zones of small bodies either side of Jupiter's orbit,
then a body, then a place on the body's own map. Only the level being looked at
shows, with a back arrow, and a search field goes straight to a body by name. A
body with no map to pick on — a gas giant, Venus and Titan under their cloud, a
rock with a shape and no picture — is the whole guess.

## Scoring

A round is worth 5,000 points, split three ways because one curve cannot tell
Titan from Enceladus and Saturn from Jupiter at once. Each part falls off as the
genre has it, `max · e^(−10 · miss / size)`:

| for        | points | miss                                  | size                                 |
| ---------- | ------ | ------------------------------------- | ------------------------------------ |
| the system | 1,000  | between the two systems' primaries    | 80 AU                                |
| the body   | 1,500  | between the two bodies, in one system | twice the system's farthest body out |
| the place  | 2,500  | along the ground                      | half the body's circumference        |

A small body is a system of one. A body guessed whole takes the place's points
with it. The misses between bodies are measured in the Solar System map at the
run's date, so the same wrong guess is worth more the month the two planets
are on the same side of the Sun, and the map a run ends on can draw every miss
as long as it was scored. For a rock of the belt that is its orbit at
that date: the map places it without flying there.

## Multiplayer

A lobby is a code. The host picks the rules and shares the link, `/j/<code>`,
or its QR; everyone picks a name and a face and plays the same rounds against
the same clock. The server only relays: the host's browser draws the rounds,
and each browser scores its own guess, with the code solo play uses.

One thing differs from solo. With free movement a solo guess is scored against
wherever the player walked to; a multiplayer guess is scored against where the
round opened, so that everyone is ranked on one question and the recap has one
place to show. A round from orbit is the same question for everyone already.

The seat is kept in the browser, so a reload, a dropped connection or a
redeploy of the server lands back in the game. Opening the same seat in a
second tab moves it there, and the first tab says so rather than fighting for
it.

The server seats a player under a name and nothing else, so the emoji and its
colour travel in front of the name (`frontend/src/game/players.ts`).

## What the SDK does

- `fetchPanoramaIndex` and `fetchPanoramas` read the panoramas a ground round is
  drawn from, and `createPanorama` stands the player in one — behind the home
  screen too. The movement setting is the view's own.
- `createMap` is the game's one Solar System map, kept for the life of the
  page (`frontend/src/game/space.ts`). It is the view of a round from orbit,
  with the camera held where the game puts it; it is what knows the sky at a
  round's date — `getSubsolarPoint` for where the lit side is, `distanceKm` for
  how far off a guess on another body was; and it is the recap, with every
  guess pinned by `addMarker` on the body it named.
- `createSystemMap` is the diagram a body is picked on, told which bodies are
  in play.
- `createFlatMap` is the map a place is picked on, with the graticule and no
  names, and the map a recap ends on, with the names back.
- `groundDistanceM` scores a miss along the ground.

A recap opens far enough back to hold every guess, flies in to the place, and
ends on the body's own map; a slider is the same flight by hand. The end of a
run shows every round on one map of the whole system, each guess joined to its
place by the dashed line the body's own map draws a miss with, and a row of the
tally looks at that round alone. The bodies guessed and the right ones are
pinned with `setPinnedBodies`, so the map keeps their rings and orbits from
however far; where two of them are too close on screen for both names, one
gives way until the reader zooms in.

Both recaps link back to spacemap.co: into the panorama a ground round was
taken from, onto the body a round from orbit was over. The SDK hands out
entries but not the site's URLs, so `frontend/src/game/links.ts` spells the
routes out.

The credit lines are the SDK's, in the corner it draws them, and are not
removable. The guess panel sits clear of the view's rather than over it.

## The SDK

`spacemap` comes from npm, with `three` as a peer dependency the app pins
itself. To play against a build of the map's repository that is not published
yet, build it there with `pnpm build:sdk:npm` and put it in place of the
installed one; `pnpm install` puts the published one back:

```sh
frontend/scripts/use-local-sdk.sh ../space-map
```

## Deploying

Pushes to `main` run the checks on GitHub, and a green run deploys to Cloudflare
Workers as static assets — no Worker code, just `dist` behind an SPA fallback.
The credentials live in the `cf-pages-deploy` environment; the token needs
account-level Workers Scripts: Edit.

The multiplayer server runs on a VPS behind a Cloudflare tunnel:
[infrastructure/multiplayer/compose](infrastructure/multiplayer/compose/README.md).

```sh
cd frontend
pnpm run deploy   # build and deploy by hand; `pnpm deploy` is pnpm's own command
```
