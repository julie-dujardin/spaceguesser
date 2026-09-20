# spaceguesser

You are standing somewhere in the solar system. Look around, then say where on
the map. Built on the [Space Map](https://spacemap.co) SDK — the panorama, the
map you guess on, and the map that shows how wrong you were are all the SDK's.

Quick play and a custom solo run are in. Daily challenge and multiplayer are
not: they need a backend this has none of.

```sh
pnpm install
pnpm dev
```

## Where the panoramas come from

The published export has ground panoramas on four Mars probes: Curiosity in
Gale, Spirit in Gusev, Perseverance in Jezero and InSight on Elysium Planitia,
4,006 of them. Panoramas covering less than a quarter of the sphere are
dropped — a narrow strip of ground has no horizon to read — which leaves 2,086
to draw rounds from. Elsewhere the export is a handful of single views, Venera
13, the Apollo landings, Huygens, and none of them clear that bar, so Mars is
the game.

A run never draws two stops from the same place, and never comes back to a
probe within three rounds while the pool has one to spare. That evens the three
rovers out instead of following the length of their traverses, Curiosity's
being three times Spirit's; InSight, a lander with two panoramas over the bar
and both from the one spot, stays the rare round it should be. So a round turns
on which probe, worth up to 6,033 km of error between Perseverance and Spirit,
and then on where along the traverse.
Scoring follows the genre: points fall off exponentially with the miss, against
the diagonal of what the panoramas actually cover, 6,050 km, rather than
against Mars. That number is read from the pool at run time, so a fifth landing
site or a second body rescales the game on its own.

## What the SDK does

- `fetchPanoramas` reads the body's panoramas, and a round is drawn from them.
- `createPanorama` stands the player in one — behind the home screen too, on
  the panorama the run is about to open with. The movement setting is the
  view's own: free lets the arrows walk the traverse, look only takes the
  arrows away, no pan or zoom hands back the drag and the wheel too.
- `createFlatMap` is both maps. The guess map wears the graticule and no names;
  the recap maps take the whole window and turn the names back on, which is
  where a round's payoff is. They open framed on the round and are then the
  reader's to drag and zoom. The end of a run draws every round on one.
- `groundDistanceM` scores it.

Both recaps link each place back to spacemap.co, into the panorama the round
was taken from. The SDK hands out entries but not the site's URLs, so
`src/game/links.ts` spells the route out — `panoramaAt` gives the key it takes.

The credit lines are the SDK's, in the corner it draws them, and are not
removable. The guess map sits clear of the panorama's rather than over it.

## The SDK

`spacemap` comes from npm, with `three` as a peer dependency the app pins
itself. The calls this app leans on — `fetchPanoramas`, and a `groundDistanceM`
that takes any two places rather than two panoramas — are in 0.1.1 onwards.

## Deploying

Pushes to `main` run the checks on GitHub, and a green run deploys to Cloudflare
Workers as static assets — no Worker code, just `dist` behind an SPA fallback.
The credentials live in the `cf-pages-deploy` environment; the token needs
account-level Workers Scripts: Edit.

```sh
pnpm run deploy   # build and deploy by hand; `pnpm deploy` is pnpm's own command
```
