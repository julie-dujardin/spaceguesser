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

The published export has ground panoramas on one body: Mars, from Curiosity in
Gale crater and Perseverance in Jezero, 502 of them. Panoramas covering less
than a quarter of the sphere are dropped — a narrow strip of ground has no
horizon to read — which leaves 393 to draw rounds from, and two stops in the
same place never both appear in one run.

Two sites means the round turns on one question, which rover, worth about 3,770
km of error, and then on where along its traverse. Scoring follows the genre:
points fall off exponentially with the miss, against the diagonal of what the
panoramas actually cover rather than against Mars. That number is read from the
pool at run time, so a third landing site or a second body rescales the game on
its own.

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

The credit lines are the SDK's, in the corner it draws them, and are not
removable. The guess map sits clear of the panorama's rather than over it.

## The SDK build

`spacemap` is not published, so it is vendored as a tarball in `vendor/` and
installed from there — the app builds with no registry and no checkout of the
map beside it. To rebuild it from a checkout:

```sh
SDK_SRC=../space-map/frontend pnpm sync-sdk
```

The tarball in `vendor/` is currently built from the `sdk-panorama-list` branch,
which adds what this app needed: `fetchPanoramas` and a `groundDistanceM` that
takes any two places rather than two panoramas. It also adds
`attributionPosition`, which this app no longer uses.
