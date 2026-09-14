import { Object3D } from 'three';

export declare type Anchor = InertialAnchor | SurfaceAnchor;

export declare type ArrowKey = 'previous' | 'next';

/** Boot-time benchmark result (see perf/atmosphere-calibration.ts). */
declare interface AtmosphereCalibration {
    /** GPU + resolution identity the run is valid for — a mismatch re-calibrates. */
    key: string;
    tier: ResolvedAtmosphereTier;
    /** Worse-scenario median per measured tier, so thresholds can be re-derived
     *  without another run. */
    worstMs: Partial<Record<ResolvedAtmosphereTier, number>>;
}

/**
 * Quality knobs for the atmosphere shells. Ray march cost is
 * primarySteps × (lightSteps + shadow work) per fragment, over the planet's
 * whole footprint — tiers pick compile-time defines instead of forking shaders.
 */
declare interface AtmosphereQualityConfig {
    /** View-ray march samples. */
    primarySteps: number;
    /** Sun-ray samples per view sample. */
    lightSteps: number;
    /** March eclipse occluders (moon shadows sweeping the air column). */
    eclipseShadows: boolean;
    /** March the ring-shadow profile through the air column. */
    ringShadows: boolean;
    /** Sky rendered from inside a shell (BackSide flip + opaque-depth prepass + skybox dimming). Off = shell vanishes once entered. */
    insideView: boolean;
    /** Sun-transmittance tints (sunset light, disc chroma, corona). Off on low tiers: surface march covers full-screen landed terrain. */
    sunTint: boolean;
    /** Piecewise Mie density profiles (Venus decks, Titan haze): two LUT taps per sample instead of one exp — high/ultra. */
    layeredDensity: boolean;
    /** Ground-bounce boost on multiple-scatter ambient. Reuses already-marched densities — free, on everywhere. */
    groundAlbedo: boolean;
    /** Mars seasonal dust/pressure cycle. CPU-only, on everywhere. */
    seasonal: boolean;
    /** Refraction lift of the Sun seen from inside a shell. CPU-only, on everywhere. */
    refraction: boolean;
}

declare type AtmosphereQualityTier = 'auto' | ResolvedAtmosphereTier;

export declare class AttributionControl implements Control<SpaceMap> {
    private stop;
    onAdd(map: SpaceMap): HTMLElement;
    onRemove(): void;
    getDefaultPosition(): ControlPosition;
}

/** Initial great-circle bearing from `a` to `b`, degrees clockwise from
 *  north; east-positive longitudes as the export lists them. */
export declare function bearingDeg(a: LonLat, b: LonLat): number;

declare interface Body_2 {
    /** Export id, as every method that takes a body takes it: `"naif-499"`. */
    id: string;
    /** In the map's reading language; null for a catalogued object with no name. */
    name: string | null;
    type: BodyType;
    /** Only on asteroids. */
    orbitClass?: OrbitClass;
    /** What it orbits, always a major body or a barycentre. */
    parentId: string;
    /** Null where the catalogue quotes no size. */
    radiusKm: number | null;
    /** False while the object has no position at the map's date — outside its
     *  ephemeris, or catalogued with no orbit at all. Nothing may be framed on
     *  it: the camera would fly to a stand-in place. */
    placed: boolean;
}
export { Body_2 as Body }

/** Pictures a host has put on a body. Each is a URL the browser can load, and
 *  what is left out is the map's own. */
export declare interface BodyAppearance {
    /** The surface map, drawn the way every body's is: equirectangular, east to
     *  the right, with longitude 0 in the middle. */
    surface?: string;
    /** Lights on the unlit side, drawn where the map draws city lights. */
    night?: string;
    /** A layer over the surface, its alpha the cover. */
    clouds?: string;
}

/** Object kinds a host can act on. The asteroid sub-types collapse into
 *  `asteroid`, whose dynamical family is {@link Body.orbitClass}. */
export declare type BodyType = 'barycenter' | 'lagrange-point' | 'star' | 'planet' | 'dwarf-planet' | 'moon' | 'asteroid' | 'comet' | 'spacecraft' | 'debris' | 'surface-feature' | 'unknown';

/** The four sides of a longitude and latitude box, in order. The corners alone
 *  would be enough on an equirectangular map and wrong on every other one, so
 *  the edges are walked and left for {@link pathFor} to fill in. */
export declare function boxRing(latMin: number, latMax: number, lonMin: number, lonSpan: number): LonLat[];

/** A suspension of the map's own camera control, for as long as it is held. */
export declare interface CameraHold {
    /** Put the camera at `pose` from the next frame on. Call it from the map's
     *  `frame` event to drive a path. */
    set(pose: CameraPose): void;
    /** Give the camera back to the map, orbiting the focused body from
     *  wherever the hold left it. */
    release(): void;
    readonly held: boolean;
}

/**
 * How far the reader may take the camera, and which objects they may put it
 * around. Everything left out is unrestricted.
 *
 * These gate reader input and nothing else. {@link SpaceMap.flyTo},
 * {@link SpaceMap.jumpTo}, {@link SpaceMap.panTo} and a held camera go where
 * they are told, outside the limits included; the reader's next gesture brings
 * the camera back inside. That is a deliberate departure from Mapbox, where
 * `maxBounds` holds the map wherever the move came from.
 */
export declare interface CameraLimits {
    /** How close and how far the reader may get to the focused body's centre. */
    minDistanceKm?: number;
    maxDistanceKm?: number;
    /** The band of the focused body the reader may look down from, in the same
     *  body-fixed degrees {@link SpaceMap.getCamera} reports. A longitude band
     *  may run through the antimeridian: 170 to −170 is the twenty degrees
     *  across it. One edge alone leaves the other at the antimeridian. */
    minLat?: number;
    maxLat?: number;
    minLon?: number;
    maxLon?: number;
    /** Export ids of the only objects a reader click may focus. Any of them when
     *  left out. */
    bodies?: string[];
}

/** Where the camera sits: over a place on a body, at a distance from it. */
export declare interface CameraOptions {
    /** The body the camera orbits, by export id — `"naif-499"` for Mars. */
    body?: string;
    /** The place on it the camera looks down at, in degrees. */
    lat?: number;
    lon?: number;
    /** How far the camera is from the body's centre, in kilometres. */
    distanceKm?: number;
}

/** Where the camera is and what it looks at. */
export declare interface CameraPose {
    position: Anchor;
    target: Anchor;
    /** Which way is up, on ecliptic J2000 axes. The ecliptic north pole when
     *  left out; a pose looking straight along it needs one of its own. */
    up?: OffsetKm;
}

/** The camera as it stands. `body` is what it orbits, which is also what the
 *  map draws in most detail. */
export declare interface CameraState {
    body: string;
    lat: number;
    lon: number;
    distanceKm: number;
}

/** Somewhere to move the camera to. What is left out is left as it is. */
export declare interface CameraTarget extends CameraOptions {
    /** A feature on `body` to look at, rather than the body as a whole. Its
     *  size frames the view, so `distanceKm` is not needed. */
    feature?: FeatureRef;
}

export declare interface Circle extends Shape {
    /** Draw it at another radius, in kilometres. */
    setRadiusKm(radiusKm: number): void;
}

export declare interface CircleOptions extends ShapeStyle {
    /** The middle of the circle. */
    anchor: Anchor;
    /** Distance from the anchor, in kilometres. */
    radiusKm: number;
    /** Which way the circle's plane faces, on ecliptic J2000 axes. The ecliptic
     *  north pole when left out, which lays the ring in the plane the planets
     *  go round in. A ring that has to turn with the body under it is a surface
     *  circle instead. */
    normal?: OffsetKm;
    /** Points round the ring. More is rounder; the default is round enough to
     *  fill the frame without corners. */
    steps?: number;
}

/** A ring of `steps` points at `radiusKm` from the origin, in the plane at
 *  right angles to `normal`. */
export declare function circlePoints(radiusKm: number, options?: CirclePointsOptions): OffsetKm[];

export declare interface CirclePointsOptions {
    /** Which way the circle's plane faces. The ecliptic north pole when left
     *  out, which draws a ring in the plane the planets go round in. */
    normal?: OffsetKm;
    /** Points round the ring. */
    steps?: number;
}

/** The clock as the host sees it, sent whenever any of it changes. */
export declare interface ClockState {
    /** Simulation time, Julian date and as a `Date`. */
    jd: number;
    date: Date;
    playing: boolean;
    /** Simulated seconds per real second, and which way time runs. */
    timeScale: number;
    direction: 1 | -1;
    /** The clock tracks wall-clock time. */
    live: boolean;
}

/** What both maps take: where to put it, where its data comes from, and what
 *  language to read it in. */
declare interface CommonOptions {
    /** The element to build the map in, or a selector that finds one. */
    container: HTMLElement | string;
    /** Root of the data export; the production CDN when omitted. Page-wide,
     *  like everything on the host: the last map created sets it, and data
     *  already fetched keeps the origin it came from. */
    dataUrl?: string;
    /** Root of the image export. Its own origin in production, since the data
     *  origin does not serve pictures; a mirror that serves both sets this to
     *  the same place as `dataUrl`. */
    imagesUrl?: string;
    /** BCP-47 tag that picks localized names; English when omitted. */
    locale?: string;
    /** Replaces the English wording the map renders itself, one key at a time. */
    messages?: Partial<CoreMessages>;
    /** Corner for the credit line; bottom-right when omitted. It cannot be
     *  taken off, but a page whose own chrome sits in that corner may move it. */
    attributionPosition?: ControlPosition;
}

/** Replace the host: what an override leaves out goes back to its default, so
 *  a second embed on the page does not inherit the first one's settings.
 *  Messages are the one thing filled in key by key — an override names the few
 *  it wants reworded and the rest stay English. */
export declare function configureHost(overrides: HostOverrides): void;

/** One piece of chrome. `M` is the map it is written for. */
export declare interface Control<M = unknown> {
    /** Build the element to place in the corner. Called once, when added. */
    onAdd(map: M): HTMLElement;
    /** Release whatever `onAdd` set up. The element itself is removed either way. */
    onRemove?(map: M): void;
    /** Corner to use when the host names none; top-right otherwise. */
    getDefaultPosition?(): ControlPosition;
}

export declare type ControlPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * What the core (scene, math, fetch) needs from whoever embeds it — the
 * SvelteKit app today, the SDK later. Read lazily through {@link host} so the
 * host can configure it at boot without import-order games; the defaults are
 * what a bare embed gets. Conditions the scene reports back travel the other
 * way, as map events.
 */
/** Scene text the core renders itself; everything else is the host's to format.
 *  Spelled out rather than typed off the app's message bundle, which would
 *  put every message of the app into the SDK's types. */
export declare interface CoreMessages {
    body_note_no_model: () => string;
    body_note_no_radius: () => string;
    carried_by_scene_label: (inputs: {
        carrier: string;
    }) => string;
    scene_canvas_label: () => string;
    attribution_orbits: () => string;
    attribution_imagery: () => string;
    credits_see_all: () => string;
    layer_surface: () => string;
    layer_clouds: () => string;
    layer_night: () => string;
    layer_graticule: () => string;
    layer_nomenclature: () => string;
    cooperative_wheel: () => string;
    cooperative_wheel_mac: () => string;
    cooperative_touch: () => string;
}

/**
 * Conditions the scene reports while it runs: the clock has left the data, or
 * it stopped at a probe's data wall. Raw dates and ids, never sentences — the
 * page around the map words them and decides how they are shown.
 */
/** A coverage edge the clock has crossed, and where it lies. */
export declare interface CoverageEdge {
    side: 'before' | 'after';
    jd: number;
}

/** The clock stopped at the focused probe's trajectory data wall. */
export declare interface CoveragePauseNotice {
    topic: 'coverage-pause';
    name: string;
    direction: 'forward' | 'backward';
    jd: number;
}

/** Mount a flat map of one body's surface and resolve once its first picture
 *  is loaded. Rejects when the body has no map texture or the data does not
 *  load. */
export declare function createFlatMap(options: FlatMapCreateOptions): Promise<FlatMap>;

/** Mount a map and resolve once it is worth looking at: the opening body
 *  placed, and the one-off quality benchmark done — that measures the GPU, so
 *  it must not run while the reader is already moving the camera. The small
 *  bodies go on streaming in behind the map this returns.
 *
 *  Rejects when WebGL is unavailable, or when the data fails before there is
 *  anything to look at; a failure past that point arrives as an `error` event. */
export declare function createMap(options: MapOptions): Promise<SpaceMap>;

/** Stand inside a panorama and resolve once the first one is on screen. The
 *  three-dimensional part is all there is: the picture, the arrows to the
 *  neighbours on the traverse, and the credit line. What a page shows around
 *  it — the panorama's date and place, a list to pick from, a map of the
 *  traverse — is its own to build from {@link PanoramaView.getPanoramas},
 *  {@link PanoramaView.getNeighbours} and the `load` and `viewchange` events.
 *
 *  Rejects when the body has no panoramas, or the one asked for is not among
 *  them; a failure past that point arrives as an `error` event. */
export declare function createPanorama(options: PanoramaCreateOptions): Promise<PanoramaView>;

/** Build a projection. The result is immutable — turning the globe or moving
 *  the central meridian means building another one, which costs nothing but
 *  the extent sampling. */
export declare function createProjection(id: ProjectionId, options?: ProjectionOptions): Projection;

/** Convert a JS Date to Julian Date. */
export declare function dateToJD(date: Date): number;

/** What a bare embed renders with: everything on, quality measured at boot and
 *  remembered per device. Reactive, so the calibration's tier reaches the
 *  renderer through the same effects a host's own store drives. */
export declare function defaultSceneSettings(): SceneSettings;

/**
 * A Keplerian orbit, propagated from its epoch by the mean motion the elements
 * carry. Defined at every date, so an object on one is always drawn.
 */
export declare function elements(options: ElementsOptions): InertialAnchor;

export declare interface ElementsOptions {
    /** What the orbit is round; the Sun when left out. */
    body?: string;
    /** The export's own elements: `a` in astronomical units, angles in degrees,
     *  `n` in degrees a day, `epoch` a Julian date. Set `equatorial` when the
     *  angles are referenced to Earth's equator rather than the ecliptic. */
    elements: OrbitalElements;
}

export declare interface Extent {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** A named surface feature, as a `featureselect` event carries it. */
export declare interface FeatureRef {
    featureId: number;
    /** Planetographic degrees, IAU convention. */
    lat: number;
    lon: number;
    diameterM: number;
}

export declare interface FeatureSelect extends FeatureRef {
    bodyId: string;
}

/** A move onto a named feature, which is the one thing the camera can turn to
 *  without travelling. */
export declare interface FeatureTarget extends CameraTarget {
    feature: FeatureRef;
}

/** `fetcher` takes the `fetch` a SvelteKit `load` is handed, so the request
 *  joins the page's own load rather than starting a second one. */
export declare function fetchPanoramaIndex(fetcher?: (url: string) => Promise<Response>): Promise<PanoramaBodySummary[]>;

/** Every panorama taken on a body, mission by mission in time order. The view
 *  reads the same list when it opens; a page that decides which panorama to
 *  open reads it first. Empty when the body has none. */
export declare function fetchPanoramas(bodyId: string): Promise<PanoramaEntry[]>;

export declare function findPanorama(entries: PanoramaEntry[], at: string | null): PanoramaEntry | null;

/** A place that does not move: on a body's surface, or at a fixed offset from
 *  its centre. It is already an anchor — this names it beside the trajectories
 *  that do move. */
export declare function fixed(place: Anchor): Anchor;

export declare class FlatAttributionControl implements Control<FlatMap> {
    private off;
    onAdd(map: FlatMap): HTMLElement;
    onRemove(): void;
    getDefaultPosition(): ControlPosition;
}

export declare interface FlatBoxOptions extends FlatShapeStyle {
    latMin: number;
    latMax: number;
    lonMin: number;
    /** Degrees of longitude the box covers, east from `lonMin`. */
    lonSpan: number;
}

export declare interface FlatCircleOptions extends FlatShapeStyle {
    center: LonLat;
    /** Radius as an angle at the body's centre. */
    radiusDeg?: number;
    /** Radius along the surface. Needs the body's radius to be known — see
     *  `FlatMap.bodyRadiusKm`; ignored when it is not. */
    radiusKm?: number;
}

export declare class FlatMap {
    private container;
    private readonly root;
    private readonly canvas;
    private readonly svg;
    private readonly layerGroup;
    private readonly shapeGroup;
    private readonly markerLayer;
    private readonly ctx;
    /* Excluded from this release type: overlay */
    private bodyId;
    private sources;
    private layerList;
    private projection;
    private projectionId;
    private projectionOptions;
    private view;
    private limits;
    /** The reader has moved the view since the last programmatic one, so the
     *  limits apply to it. A {@link setView} lands where it was told. */
    private limitsArmed;
    private jd;
    private cooperative;
    /** The body's mean radius, so a circle can be drawn in kilometres. */
    bodyRadiusKm: number | null;
    /** Decoded pictures by URL, and the readable copies the resampler needs. */
    private readonly bitmaps;
    private readonly rasters;
    private readonly pending;
    /** Pictures the export does not have. Remembered, or every pan would ask
     *  for them again and report the same failure. */
    private readonly missing;
    /** Bumped whenever the map moves to another body, so work started for the
     *  one being left can tell that it is no longer wanted. */
    private generation;
    /** Teardowns for controls mounted inside the map's box. */
    private controls;
    /* Excluded from this release type: attribution */
    /** Dragging the map about — a globe turns, a rectangle slides. */
    readonly dragPan: GestureHandler;
    /** The wheel. */
    readonly scrollZoom: GestureHandler;
    /** The wheel and one finger belong to the page, not the map. */
    readonly cooperativeGestures: GestureHandler;
    private lookup;
    private lookupKey;
    private buffer;
    private frame;
    private resizeObserver;
    private readonly listeners;
    private announcedReady;
    private disposed;
    /** Set while a gesture is in flight, to draw coarsely until it stops. */
    private moving;
    /** Running cost of one drawn pixel, which sets the resolution of a moving
     *  frame. Zero until the first draw has been timed. */
    private msPerPixel;
    private settleTimer;
    /** Which layers have been asked for, by id — the host's opening choice and
     *  every change since. Kept apart from the layers themselves, which are
     *  rebuilt per body: what the reader switched on should outlast a body that
     *  happens not to have it. */
    private readonly chosenVisibility;
    /** Layers the host added itself. Kept aside from the body's own, so
     *  changing body rebuilds one set without discarding the other. */
    private readonly customLayers;
    constructor(options?: FlatMapOptions);
    /* Excluded from this release type: mount */
    /** Hang a control in one of the map's corners; top-right unless the control
     *  or the caller names another. Adding the same control twice does nothing. */
    addControl(control: Control<FlatMap>, position?: ControlPosition): this;
    /** Take a control back off. The credit line is not one a host may remove —
     *  the imagery terms the pictures are published under require it. */
    removeControl(control: Control<FlatMap>): this;
    /** Take the map back out of its container. It is finished afterwards; open
     *  another with {@link createFlatMap}. */
    remove(): void;
    /* Excluded from this release type: unmount */
    /* Excluded from this release type: load */
    /**
     * Take a body on: find out what it has, and only then show it.
     *
     * Nothing of the body already on screen is let go until the new one is known
     * to have a map at all, so asking for a body that has none leaves the map as
     * it was and rejects, rather than emptying it first.
     */
    private adopt;
    /** Let go of the pictures and the layers of the body being left behind. The
     *  generation moves with them, so a fetch still in flight for that body
     *  drops what it decodes instead of holding it for nothing. */
    private release;
    private buildLayers;
    /** Every layer of the body on screen, in drawing order, with the label and
     *  the credit each carries. */
    get layers(): LayerInfo[];
    /** The layer ids alone, so a switcher can be built the same way on either
     *  map. Which ids there are depends on the body: not every one has clouds
     *  or a night side. */
    getLayers(): string[];
    isLayerVisible(id: string): boolean;
    /** Credits for everything currently drawn — what the embed has to show. */
    get credits(): LayerCredit[];
    setLayerVisible(id: string, visible: boolean): void;
    setLayerOpacity(id: string, opacity: number): void;
    /** A picture of the host's own, wrapped round the body the same way the
     *  export's are: longitude across, latitude down, −180° at the left edge. */
    addRasterLayer(spec: {
        id: string;
        label?: string;
        url: string;
        opacity?: number;
        blend?: 'normal' | 'add';
        visible?: boolean;
        credit?: LayerCredit;
    }): void;
    /** A layer the host draws itself, given the view to draw for. Where a
     *  vector terrain map or a coverage grid goes. */
    addVectorLayer(spec: {
        id: string;
        label?: string;
        visible?: boolean;
        credit?: LayerCredit;
        render: VectorLayer['render'];
        prepare?: VectorLayer['prepare'];
    }): void;
    get projectionName(): ProjectionId;
    static get projections(): readonly ProjectionId[];
    setProjection(id: ProjectionId, options?: ProjectionOptions): void;
    /** Where the map is, as a place rather than as plane coordinates — the
     *  middle of the frame. A globe is turned to face it and a rectangle is slid
     *  to it, so what {@link setView} is given is what this reads back. */
    get viewState(): FlatViewState;
    setView(view: Partial<FlatViewState>): void;
    /**
     * Replace the reader's limits, whole. What the new set leaves out is
     * unrestricted again, except `maxZoom`, which goes back to 16.
     *
     * Limits gate reader input only: {@link setView} lands where it was told,
     * and the reader's next gesture brings the view back inside.
     */
    setLimits(limits: FlatMapLimits): this;
    /** The limits as they stand. */
    getLimits(): FlatMapLimits;
    /** The moment the map is of. Moves the clouds and, on Earth, the season. */
    setTime(jd: number): void;
    setBody(bodyId: string): Promise<void>;
    /** Screen pixel for a place, relative to the map's own box. */
    project(lon: number, lat: number): [number, number] | null;
    /** The place under a pixel of the map's box, or null off the world. */
    unproject(px: number, py: number): LonLat | null;
    addPolyline(options: FlatPolylineOptions): FlatShape;
    addPolygon(options: FlatPolygonOptions): FlatShape;
    addBox(options: FlatBoxOptions): FlatShape;
    addCircle(options: FlatCircleOptions): FlatShape;
    addMarker(options: FlatMarkerOptions): FlatMarker;
    /** Remove every drawing the host has added, leaving the layers alone. */
    clearDrawings(): void;
    /** Listen for `event`. The returned function stops listening, which is the
     *  same thing {@link off} does. */
    on<K extends keyof FlatMapEvents>(event: K, listener: FlatMapEvents[K]): () => void;
    /** Listen for the next `event` only. */
    once<K extends keyof FlatMapEvents>(event: K, listener: FlatMapEvents[K]): () => void;
    off<K extends keyof FlatMapEvents>(event: K, listener: FlatMapEvents[K]): void;
    private emit;
    private tier;
    private urlsInUse;
    /** Fetch and decode whatever the current view needs but has not got. */
    private loadVisible;
    /** The readable copy the resampler samples, shrunk to about what the view
     *  can show. Cached per size so panning does not rebuild it. */
    private rasterFor;
    private viewport;
    /** Draw on the next frame. Repeated calls in one frame draw once. */
    render(): void;
    /** Draw coarsely now and sharply when the movement stops. */
    private renderMoving;
    private draw;
    /**
     * What one pixel of the last few resampled frames cost, in milliseconds.
     * Kept as a running mean so one slow frame — the browser busy elsewhere —
     * does not decide the resolution on its own.
     */
    private record;
    /**
     * The fraction of full resolution a moving frame is drawn at, from what the
     * projection has been measured to cost rather than from a list of which ones
     * are slow. A projection that fits the budget is left alone.
     *
     * `full` is the pixel count the frame would have at full resolution, not the
     * count the last frame happened to be drawn at — measuring against a canvas
     * that is already coarse would let the scale chase its own tail.
     */
    private interactionScale;
    /** The rim of a globe is cut by the compositor rather than left to the
     *  raster, whose staircase would show whenever it is drawn coarsely. */
    private clipToDisc;
    private drawRaster;
    private drawVector;
    /** One finger drags the page, so the browser needs it back. */
    private applyCooperative;
    private attachInteraction;
    /**
     * A drag turns a globe and slides a rectangle. Both keep the place under
     * the pointer roughly under it, which is what makes the gesture feel like
     * moving the map rather than moving a camera.
     */
    private drag;
    /** Zoom about a point, so what is under the pointer stays under it. */
    private zoomBy;
}

export declare interface FlatMapCreateOptions extends CommonOptions, FlatMapOptions {
    controls?: Control<FlatMap>[];
    /** Listeners attached before the first load, so a slow or failed load is
     *  observable while it runs. Later ones go through {@link FlatMap.on}. */
    events?: {
        [K in keyof FlatMapEvents]?: FlatMapEvents[K];
    };
}

export declare interface FlatMapEvents {
    /** The first surface picture is on screen. */
    ready: () => void;
    error: (error: Error) => void;
    viewchange: (view: FlatViewState) => void;
    layerschange: (layers: LayerInfo[]) => void;
    /** Where the reader clicked, or null for a click off the world. */
    click: (at: LonLat | null, event: PointerEvent) => void;
    pointermove: (at: LonLat | null, event: PointerEvent) => void;
}

/** The gestures the flat map hangs a handler off for. */
export declare type FlatMapGesture = 'dragPan' | 'scrollZoom';

/**
 * How far the reader may take the view. Everything left out is unrestricted,
 * beyond the two things the map holds to whatever it is told: the whole world
 * is the furthest out it goes, and the frame is never let off the map.
 *
 * These gate reader input and nothing else. {@link FlatMap.setView} goes where
 * it is told, outside the limits included; the reader's next gesture brings the
 * view back inside.
 */
export declare interface FlatMapLimits {
    /** 1 is the whole world; the reader may not go under it either way. */
    minZoom?: number;
    maxZoom?: number;
    /** The band of the surface the middle of the frame may sit in. A longitude
     *  band may run through the antimeridian: 170 to −170 is the twenty degrees
     *  across it. One edge alone leaves the other at the antimeridian. */
    minLon?: number;
    maxLon?: number;
    minLat?: number;
    maxLat?: number;
}

export declare interface FlatMapOptions {
    /** Body to draw, by export id — `"naif-399"` for Earth, `"naif-499"` for
     *  Mars. Earth when left out. */
    body?: string;
    projection?: ProjectionId;
    /** Meridian and parallel the map is centred on. The parallel only turns the
     *  two globe projections; the others are always centred on the equator. */
    centerLon?: number;
    centerLat?: number;
    /** How far from the centre a globe projection reaches, in degrees. */
    clipAngle?: number;
    /** 1 shows the whole world. */
    zoom?: number;
    /** The moment the map is of, which picks the cloud snapshot and the month
     *  of a seasonal surface. Now when left out. */
    jd?: number;
    /** Which layers start switched on, by id. The surface always is. */
    layers?: Record<string, boolean>;
    /** Whether the reader may move the map at all. True unless it is said
     *  otherwise; false switches every gesture off. */
    interactive?: boolean;
    /** Gestures to start on or off one at a time, over whatever `interactive`
     *  said. Each is a handler on the map afterwards. */
    interactions?: Partial<Record<FlatMapGesture, boolean>>;
    /** The map inside a page the reader scrolls past: the wheel scrolls the page
     *  unless ctrl (⌘ on a Mac) is held, and one finger drags the page rather
     *  than the map. A hint says so whenever the plain gesture is tried. */
    cooperativeGestures?: boolean;
    /** How far the reader may take the view. Reader input only — see
     *  {@link FlatMap.setLimits}. */
    limits?: FlatMapLimits;
}

export declare interface FlatMarker {
    readonly element: HTMLElement;
    setPosition(at: LonLat): void;
    setVisible(visible: boolean): void;
    remove(): void;
}

export declare interface FlatMarkerOptions {
    at: LonLat;
    /** The host's element, placed over the map as it is. A plain dot when left
     *  out. */
    element?: HTMLElement;
    /** Which point of the element sits on the place, 0 to 1 in its own box.
     *  Its centre by default. */
    align?: readonly [number, number];
    className?: string;
    /** Take pointer events. Off by default, as for a shape: the map is dragged
     *  through the marker layer unless a marker opts back in. */
    interactive?: boolean;
}

export declare interface FlatPolygonOptions extends Omit<FlatPolylineOptions, 'closed'> {
    points: readonly LonLat[];
}

export declare interface FlatPolylineOptions extends FlatShapeStyle {
    points: readonly LonLat[];
    /** How the space between the given points is filled: along the parallels
     *  and meridians, or the short way over the sphere. */
    interpolate?: Interpolation;
    /** Join the last point back to the first. */
    closed?: boolean;
}

/** A drawing on the map, for as long as the host keeps it. */
export declare interface FlatShape {
    /** The element itself, for a host that wants to style or animate it: a
     *  group holding the shape's outline and, for an area, its fill, drawn
     *  apart so the fill can stop at the limb of a globe where the outline
     *  goes out of sight. */
    readonly node: SVGGElement;
    /** Replace the geometry, keeping the styling. */
    setPoints(points: readonly LonLat[]): void;
    setVisible(visible: boolean): void;
    remove(): void;
}

export declare interface FlatShapeStyle {
    /** Stroke colour: any CSS colour. White when left out. */
    color?: string;
    /** Stroke width in screen pixels, held at every zoom. */
    widthPx?: number;
    /** 0 to 1, over the whole shape. */
    opacity?: number;
    /** Fill colour for an area. Unfilled when left out. */
    fill?: string;
    fillOpacity?: number;
    /** SVG dash pattern, e.g. `"4 3"`. */
    dash?: string;
    /** Added to the element, for styling from the host's own stylesheet. */
    className?: string;
    /** Take pointer events. Off by default, so drawings never get in the way of
     *  panning the map under them. */
    interactive?: boolean;
    onclick?: (event: PointerEvent) => void;
    onpointerenter?: (event: PointerEvent) => void;
    onpointerleave?: (event: PointerEvent) => void;
    /** Names the shape for a screen reader, which also makes it focusable. */
    ariaLabel?: string;
}

export declare interface FlatViewState {
    projection: ProjectionId;
    zoom: number;
    centerLon: number;
    centerLat: number;
}

export declare interface FocusChange {
    body: Body_2 | undefined;
    /** The first settle after boot. */
    initial: boolean;
    /** The camera orbits a surface feature; `body` is its host. */
    feature: boolean;
}

/**
 * One reader gesture, switched on and off on its own. Mapbox hangs a handler
 * like this off the map for each gesture it knows, and both maps here do the
 * same, so `map.scrollZoom.disable()` reads alike on either of them.
 */
export declare class GestureHandler {
    private enabled;
    private readonly apply;
    /* Excluded from this release type: __constructor */
    enable(): void;
    disable(): void;
    isEnabled(): boolean;
    private set;
}

/** Meridians and parallels every `stepDeg`, each as its own run of places.
 *  Meridians are drawn pole to pole and parallels right round, so the grid
 *  bends with whatever projection draws it. */
export declare function graticule(stepDeg?: number): LonLat[][];

/** Great-circle distance on a sphere of `radiusKm`, in metres. Rover steps
 *  are metres on a body thousands of kilometres across, so the ellipsoid's
 *  flattening changes nothing a reader would see. Any two places will do: a
 *  panorama is one, and so is a point a reader named. */
export declare function groundDistanceM(a: LonLat, b: LonLat, radiusKm: number): number;

export declare interface Host {
    /** Root of the data export; versioned files hang off it. */
    dataUrl: string;
    /** Root of the image export, on its own origin in production. */
    imagesUrl: string;
    /** BCP-47 tag of the reading language: picks localized names and drives Intl. */
    locale: () => string;
    messages: CoreMessages;
    /** Link target of a body's scene label. */
    bodyHref: (id: string, name: string) => string;
}

/** Overrides, with messages filled in one key at a time. */
export declare type HostOverrides = Partial<Omit<Host, 'messages'>> & {
    messages?: Partial<CoreMessages>;
};

export declare interface Icon extends Shape {
    /** The `<img>` itself, for a host that wants to listen to it or style it
     *  further. */
    readonly element: HTMLImageElement;
    setUrl(url: string): void;
}

export declare interface IconOptions {
    anchor: Anchor;
    /** Where the picture comes from. Anything an `<img>` takes, a data URL
     *  included. */
    url: string;
    /** Width in screen pixels. The picture's own width when left out. */
    widthPx?: number;
    /** Height in screen pixels. Follows the width when left out. */
    heightPx?: number;
    /** Which point of the picture sits on the anchor, 0 to 1 in its own box.
     *  Defaults to its centre. */
    align?: readonly [number, number];
    /** Hide it when its place has turned to the far side of the body it sits
     *  on. */
    occlude?: boolean;
    /** 0 to 1. */
    opacity?: number;
    /** Take pointer events, so the host's own listeners on {@link Icon.element}
     *  fire. Off by default: the camera is dragged through the label layer. */
    interactive?: boolean;
    className?: string;
    /** Describes the picture to a screen reader. Empty by default, which is
     *  what a decorative picture should say. */
    alt?: string;
}

/** Fixed in the body's inertial frame: it travels with the body but does not
 *  turn with it. The body's centre when the offset is left out. An offset read
 *  from a function is a trajectory — see {@link samples}, {@link elements} and
 *  {@link tle} — and a date it says nothing about returns null, which leaves
 *  whatever the anchor carries undrawn. */
export declare interface InertialAnchor {
    body: string;
    offsetKm?: OffsetKm | ((jd: number) => OffsetKm | null);
}

/** How the space between two given points is filled in. */
export declare type Interpolation = 
/** Even in longitude and latitude — what a chart box or a graticule wants,
*  since its edges follow the parallels and meridians. */
'linear'
/** The short way over the sphere, which is what a flight path or a ground
*  track means by a straight line. */
| 'geodesic';

/** Convert a Julian Date to a JS Date. */
export declare function jdToDate(jd: number): Date;

/** The same, for a move that does not animate: framing a body against another
 *  one only makes sense as a placement, never as a flight. */
export declare interface JumpTarget extends CameraTarget {
    /** Put this other body — the Sun, usually — behind the one being framed. */
    facing?: string;
    /** How far above the ecliptic to look from, in degrees. */
    elevationDeg?: number;
}

/** Kilometres as astronomical units. Orbital elements are quoted with their
 *  semi-major axis in AU wherever the map reads them, and that is the one
 *  distance on the public surface which is not in kilometres. */
export declare function kmToAu(km: number): number;

export declare interface Label extends Shape {
    /** The element the text is in, for a host that wants to listen to it or
     *  style it further. */
    readonly element: HTMLElement;
    setText(text: string): void;
}

export declare interface LabelOptions {
    anchor: Anchor;
    text: string;
    /** Any CSS colour. White when left out. */
    color?: string;
    fontSizePx?: number;
    /** Which point of the text sits on the anchor, 0 to 1 in its own box.
     *  Defaults to its centre. */
    align?: readonly [number, number];
    /** Hide the label when its place has turned to the far side of the body it
     *  sits on. */
    occlude?: boolean;
    /** Take pointer events, so the host's own listeners on {@link Label.element}
     *  fire. Off by default: the camera is dragged through the label layer. */
    interactive?: boolean;
    /** Added to the element, for styling from the host's own stylesheet. */
    className?: string;
}

export declare type Layer = RasterLayer | VectorLayer;

/** Who a layer's imagery belongs to. Carried up to the credit line, which the
 *  data's terms require an embed to show. */
export declare interface LayerCredit {
    organisation: string;
    source: string;
    attribution?: string;
}

/** A layer as a host sees it. */
export declare interface LayerInfo {
    id: string;
    label: string;
    kind: 'raster' | 'vector';
    visible: boolean;
    credit?: LayerCredit;
}

/** A place. Longitude east-positive, latitude north-positive, both degrees. */
export declare interface LonLat {
    lon: number;
    lat: number;
}

/** Every layer, in the order a switcher should offer them: the objects first,
 *  then the chrome drawn around them. */
export declare const MAP_LAYERS: readonly ["planets", "dwarfPlanets", "moons", "asteroids", "comets", "spacecraft", "satellites", "debris", "orbits", "labels", "nomenclature", "stars"];

export declare interface MapEvents {
    focuschange: (e: FocusChange) => void;
    /** The camera came to rest around the focused body. */
    camera: (view: CameraState) => void;
    /** A nomenclature label was clicked; carries what a fly-to needs. */
    featureselect: (e: FeatureSelect) => void;
    /** User-promoted bodies that can be cleared (the focused one excluded). */
    userpromoted: (count: number) => void;
    contextlost: () => void;
    contextrestored: () => void;
    /** The clock moved, or its play state, rate or direction changed. */
    clock: (e: ClockState) => void;
    /** Data loading started or finished, the one-off quality benchmark
     *  included; `false` means the map is ready to look at. */
    loading: (loading: boolean) => void;
    /** Boot progress, 0 to 1, monotonic within one load. */
    progress: (fraction: number) => void;
    /** The data could not be loaded. The map stays mounted and empty. */
    error: (message: string) => void;
    /** The export was republished while this map was open: its data is now a
     *  version behind, and reloading the page picks the new one up. */
    datastale: () => void;
    /** A condition worth telling the reader about; one live notice per topic. */
    notice: (notice: Notice) => void;
    /** That topic's condition cleared. */
    noticedismiss: (topic: NoticeTopic) => void;
    /** A layer was switched, by the host or by a control on the map. Carries
     *  the ids left visible, which is what a switcher redraws from. */
    layerschange: (visible: MapLayerId[]) => void;
    /** Once per drawn frame, with the bodies at that frame's positions and the
     *  camera not yet moved. `dtMs` is 0 after a skipped frame. */
    frame: (e: {
        jd: number;
        dtMs: number;
    }) => void;
}

/** The gestures the map hangs a handler off for. */
export declare type MapGesture = 'dragRotate' | 'scrollZoom' | 'keyboard' | 'bodySelect' | 'featureSelect';

export declare type MapLayerId = (typeof MAP_LAYERS)[number];

/** A host's object on the map, for as long as the host keeps it. */
export declare interface MapObject {
    readonly id: string;
    readonly name: string | null;
    /** Where it is, as the anchor it was given — hand it to a camera hold to
     *  follow the object, or to a drawing to hang something off it. */
    readonly position: Anchor;
    /** Kilometres from the body it is measured from, on ecliptic J2000 axes, at
     *  `jd`. Null where the trajectory says nothing; a fixed place on a surface
     *  answers null too, since it is not measured as an offset. */
    positionKm(jd: number): readonly [number, number, number] | null;
    /** Move it, including onto another body or another trajectory. */
    setPosition(position: Anchor): void;
    setVisible(visible: boolean): void;
    remove(): void;
}

export declare interface MapObjectModel {
    /** The host's own three.js object, added to the map's scene as it is. The
     *  map never loads one: build it, or load it with a loader of your own. */
    object3d: Object3D;
    /** How big it is drawn, in metres across its longest dimension — the real
     *  size of the craft, arrays and booms deployed. Drawn in the units the
     *  object3d was built in when left out. */
    scaleM?: number;
    /** Never draw it smaller than this many pixels across. A twelve-metre
     *  satellite is nothing at all from a planetary view; this keeps it
     *  visible, at the cost of its true size. */
    minPx?: number;
}

export declare interface MapObjectOptions {
    /** The host's own id, unique on this map. One is made up when left out. */
    id?: string;
    /** What it is called, for the label and for the host's own use. */
    name?: string;
    /** Where it is, at any date: a fixed place, or a trajectory. */
    position: Anchor;
    model?: MapObjectModel;
    /** Write the name beside it, in the map's own way of drawing a label. */
    label?: boolean;
    /** Hide the label while the object is behind the body it is measured from.
     *  The model is hidden by the body itself, whatever this says. */
    occludeLabel?: boolean;
}

/**
 * The objects a host has put on the map, by id. Adding one draws it from the
 * next frame; removing one takes it away with whatever it drew.
 */
export declare interface MapObjects {
    /** Put an object on the map. An id already in use is replaced, so a host
     *  driving the collection from its own state does not double up. */
    add(options: MapObjectOptions): MapObject;
    get(id: string): MapObject | undefined;
    /** Every object on the map, in the order they were added. */
    all(): MapObject[];
    /** Take them all away. The map's own drawings are left alone. */
    clear(): void;
}

export declare interface MapOptions extends CommonOptions, SpaceMapOptions {
    /** Controls to hang on the map, each in the corner it asks for. The credit
     *  line is always there and is not one of them. */
    controls?: Control<SpaceMap>[];
    /** Listeners attached before the first load, so the boot's `progress`,
     *  `loading` and `error` events are observable while it runs. Later ones go
     *  through {@link SpaceMap.on}. */
    events?: {
        [K in keyof MapEvents]?: MapEvents[K];
    };
}

/** A marker on the map, for as long as the host keeps it. */
export declare interface Marker {
    readonly element: HTMLElement;
    /** Move it, including onto another body. */
    setAnchor(anchor: Anchor): void;
    /** Show or hide it without giving up its place. */
    setVisible(visible: boolean): void;
    remove(): void;
}

export declare interface MarkerOptions {
    anchor: Anchor;
    /** The host's element. It is moved into the map's label layer as it is,
     *  keeping its own classes and listeners. */
    element: HTMLElement;
    /** Which point of the element sits on the anchor, 0 to 1 in its own box.
     *  Defaults to its centre. */
    align?: readonly [number, number];
    /** Hide the marker when its place has turned to the far side of the body
     *  it sits on. Only that body is tested, never another one in front. */
    occlude?: boolean;
}

export declare interface Neighbour {
    entry: PanoramaEntry;
    /** Ground distance from the current panorama, metres. */
    distanceM: number;
    /** Initial bearing to it, degrees clockwise from north. */
    bearingDeg: number;
}

export declare interface Neighbours {
    previous: Neighbour | null;
    next: Neighbour | null;
}

/** The entries before and after `current` on the same mission's traverse.
 *  The list is already mission-then-time ordered, so neighbours are adjacent
 *  rows until the mission changes. */
export declare function neighboursOf(entries: PanoramaEntry[], current: PanoramaEntry, radiusKm: number): Neighbours;

export declare type Notice = OutOfRangeNotice | CoveragePauseNotice;

export declare type NoticeTopic = Notice['topic'];

/** Kilometres on ecliptic J2000 axes, x toward the equinox and z toward the
 *  ecliptic north pole. */
export declare type OffsetKm = readonly [number, number, number];

export declare interface OrbitalElements {
    a: number;
    e: number;
    i: number;
    om: number;
    w: number;
    ma: number;
    n: number;
    epoch: number;
    /**
     * Secular drift rates (deg/day) applied to om and w. Populated for SPICE
     * moons via the Method C mean-element fit so the propagated orbit tracks
     * J2-driven nodal/apsidal precession. Absent (or zero) means the angles
     * are static — the default for Horizons/SBDB-sourced bodies.
     */
    omDot?: number;
    wDot?: number;
    q?: number;
    tp?: number;
    /**
     * True when i/om/w are referenced to Earth's mean equator of J2000 instead of
     * the ecliptic. TLE-sourced Earth satellites (CelesTrak) are in TEME, treated
     * here as equatorial; everything else (Horizons/SPICE) is ecliptic J2000.
     */
    equatorial?: boolean;
}

/** Dynamical family of an asteroid, from its SBDB orbit class. */
export declare type OrbitClass = 'inner' | 'main-belt' | 'trojan' | 'centaur' | 'tno';

/** Which groups lack data at the current time. */
export declare interface OutOfRangeNotice {
    topic: 'out-of-range';
    focusedOutOfRange: boolean;
    /** Zone-level satellite coverage: past the archive, or inside a hole. */
    satellites: {
        side: 'after';
        jd: number;
    } | {
        side: 'gap';
    } | null;
    majorBodies: CoverageEdge | {
        side: 'outside';
    } | null;
}

/** `<time>,<lat>,<lon>`: the same triple the export lists, so the key
 *  round-trips without a lookup table. */
export declare function panoramaAt(entry: PanoramaEntry): string;

export declare class PanoramaAttributionControl implements Control<PanoramaView> {
    private off;
    onAdd(view: PanoramaView): HTMLElement;
    onRemove(): void;
    getDefaultPosition(): ControlPosition;
}

export declare interface PanoramaBodySummary {
    id: string;
    missions: PanoramaMissionSummary[];
}

export declare interface PanoramaCreateOptions extends CommonOptions, PanoramaViewOptions {
    /** Controls to hang on the view, each in the corner it asks for. The credit
     *  line is always there and is not one of them. */
    controls?: Control<PanoramaView>[];
    /** Listeners attached before the first load, so a slow or failed load is
     *  observable while it runs. Later ones go through {@link PanoramaView.on}. */
    events?: {
        [K in keyof PanoramaViewEvents]?: PanoramaViewEvents[K];
    };
}

/** One ground-level sphere texture placed on a body: `v1/panoramas/{id}.webp`,
 *  an equirectangular image whose left edge is north and whose azimuth runs
 *  clockwise. Transparent texels are directions the mosaic never observed. */
export declare interface PanoramaEntry {
    id: string;
    /** Mission slug the traverse belongs to (`perseverance`, `curiosity`). */
    mission?: string;
    instrument?: string;
    sol?: number;
    /** Capture start, ISO 8601. Orders the traverse within a mission. */
    time: string;
    time_end?: string;
    /** Planetocentric latitude and east longitude of the rover, degrees. */
    lat: number;
    lon: number;
    elevation_m?: number;
    /** Height of the camera above the surface, metres. Present only where the
     *  view was taken from the air, as Huygens' descent mosaic was. */
    altitude_m?: number;
    title?: string;
    /** Image azimuth of true north, degrees clockwise from the left edge.
     *  Zero, and meaningless, where `orientation` is `unknown`. */
    north_offset_deg: number;
    /** How north was established, absent where the archive itself states it.
     *  `unknown` means the sphere sits at an arbitrary azimuth, so nothing
     *  may be drawn or written as a heading. The full set `export/panoramas.py`
     *  writes — a wider union would erase the literals and stop checking. */
    orientation?: 'unknown' | 'caption-aligned' | 'matched to an archival sphere';
    /** `estimated` where the sphere's angular bounds were fitted to a
     *  published flat image rather than read from an archive label. */
    geometry?: 'estimated';
    /** Image azimuth where the observed span begins, with its width; absent
     *  when the archive label carried no coverage geometry. */
    azimuth_start_deg?: number;
    hfov_deg?: number;
    /** Solid-angle share of the sphere the mosaic covers, percent. */
    sphere_percent?: number;
    color?: string;
    credit?: string;
    credit_url?: string;
    source_url?: string;
}

/** One probe's coverage on a body, as `export/panoramas.py` writes it. */
export declare interface PanoramaMissionSummary {
    mission: string;
    /** `probe-<id>` of the craft that drove this traverse; absent where the
     *  spacecraft table does not describe it. */
    probe?: string;
    count: number;
    first_time: string;
    last_time: string;
}

export declare class PanoramaView {
    private readonly bodyId;
    private readonly openAt;
    /** The host's opening direction, spent on the first panorama. */
    private openingView;
    private readonly interactive;
    private readonly followArrows;
    private limits;
    /* Excluded from this release type: attribution */
    private container;
    private readonly root;
    private renderer;
    private controls;
    private resizeObserver;
    private readonly scene;
    private readonly camera;
    private readonly sphere;
    /** The heading and elevation grid, drawn over the canvas in 2D so its
     *  lines and labels keep one weight at every zoom. */
    private readonly angleCanvas;
    private readonly angleContext;
    private angleGridVisible;
    private readonly arrows;
    private readonly arrowGeometry;
    private readonly raycaster;
    private readonly loader;
    private texture;
    private loadToken;
    private frame;
    private disposed;
    private entries;
    private radiusKm;
    private current;
    private neighbours;
    private view;
    private readonly pointers;
    private pinchDistance;
    private dragStart;
    private hovered;
    private readonly lookAt;
    private readonly ndc;
    private readonly gridPoint;
    private readonly viewDirection;
    private readonly listeners;
    constructor(options: PanoramaViewOptions);
    /** Put the view's own box inside `container`. */
    mount(container: HTMLElement): void;
    /** Fetch the body's list and open the panorama asked for, or its first. */
    load(): Promise<void>;
    addControl(control: Control<PanoramaView>, position?: ControlPosition): this;
    removeControl(control: Control<PanoramaView>): this;
    /** Take the view down and let go of everything it holds. */
    remove(): void;
    /** Every panorama of the body, mission by mission in time order. */
    getPanoramas(): readonly PanoramaEntry[];
    getCurrent(): PanoramaEntry | null;
    /** The panoramas before and after the current one on its traverse. */
    getNeighbours(): Neighbours | null;
    /** Show a panorama: an entry from the list, its id, or its `time,lat,lon`
     *  key. Resolves once it is on screen; a newer call supersedes one still
     *  in flight. */
    open(target: PanoramaEntry | string): Promise<void>;
    /** Open the previous or next panorama on the traverse, when there is one. */
    step(key: ArrowKey): Promise<void>;
    private byKey;
    getView(): PanoramaViewState;
    /** Turn or zoom the view, within its limits. */
    setView(view: Partial<PanoramaViewState>): void;
    getLimits(): PanoramaViewLimits;
    /** Bound the view; the current one moves inside the bounds at once. An
     *  empty object frees it. */
    setLimits(limits: PanoramaViewLimits): void;
    on<K extends keyof PanoramaViewEvents>(event: K, listener: PanoramaViewEvents[K]): () => void;
    once<K extends keyof PanoramaViewEvents>(event: K, listener: PanoramaViewEvents[K]): () => void;
    off<K extends keyof PanoramaViewEvents>(event: K, listener: PanoramaViewEvents[K]): void;
    private emit;
    private loadTexture;
    private setArrowTargets;
    private invalidate;
    /** Lay a grid of headings and elevations over the view, every ten degrees. */
    setAngleGridVisible(visible: boolean): void;
    /** Show or hide the arrows to the neighbouring panoramas. */
    setArrowsVisible(visible: boolean): void;
    private resize;
    private render;
    /** Drawn after projection so grid weight and type stay constant across the view. */
    private drawAngleGrid;
    private traceAngleLine;
    private projectAngle;
    /** Degrees of view per pixel dragged, so a drag follows the finger at any zoom. */
    private degreesPerPixel;
    private arrowAt;
    private pressArrow;
    private readonly onPointerDown;
    private readonly onPointerMove;
    /** A press is a click when one pointer went down and barely moved. A
     *  non-interactive view takes no pointer down, so every release is one. */
    private readonly onPointerUp;
    private readonly onPointerCancel;
    private pinchSpan;
    private zoom;
    private readonly onWheel;
    private readonly onKeyDown;
}

export declare interface PanoramaViewEvents {
    /** The body's list is in; the first panorama is being fetched. */
    ready: () => void;
    /** This panorama is on screen. */
    load: (entry: PanoramaEntry) => void;
    error: (error: Error) => void;
    viewchange: (view: PanoramaViewState) => void;
    /** An arrow was pressed. */
    step: (target: {
        key: ArrowKey;
        entry: PanoramaEntry;
    }) => void;
    /** Where the arrows landed on screen, after each frame. */
    arrows: (anchors: Partial<Record<ArrowKey, ScreenAnchor>>) => void;
}

/** How far the reader may look and zoom. Headings run clockwise from the
 *  first to the second, so `[300, 60]` is the arc across north; a pair of
 *  equal values locks that axis. Each pair sits inside the view's own range. */
export declare interface PanoramaViewLimits {
    heading?: [from: number, to: number];
    pitch?: [min: number, max: number];
    fov?: [min: number, max: number];
}

export declare interface PanoramaViewOptions {
    /** Body whose panoramas to show, by export id — `"naif-499"` for Mars. */
    body: string;
    /** The panorama to open first: its id, or its `time,lat,lon` key. The
     *  body's first when left out. */
    at?: string;
    /** Where to look first. Without them the view faces the middle of a
     *  partial sweep, else north. */
    heading?: number;
    pitch?: number;
    fov?: number;
    /** Whether the reader may turn the view: drag, pinch, wheel and the arrow
     *  keys. True unless said otherwise. */
    interactive?: boolean;
    /** Bounds on the view; none unless said otherwise. */
    limits?: PanoramaViewLimits;
    /** Draw the arrows to the previous and next panorama. True unless said
     *  otherwise. */
    arrows?: boolean;
    /** Whether pressing an arrow opens the panorama it points at. True unless
     *  said otherwise; a host that keeps the panorama in its own URL turns it
     *  off and opens the target itself on `step`. */
    followArrows?: boolean;
}

export declare interface PanoramaViewState {
    /** Compass heading, degrees clockwise from north. */
    heading: number;
    /** Degrees above the horizon. */
    pitch: number;
    /** Vertical field of view, degrees. */
    fov: number;
}

/**
 * An SVG path for a run of places. Empty when none of it is on the map, so a
 * caller can render the result straight into `d` either way.
 *
 * A closed shape is cut at the seam first, so each piece of it is a shape in
 * its own right and can be filled. A globe has no seam, only a limb, and its
 * shapes are never cut on the far side. What the limb of a globe cuts is left open
 * instead: there the shape really does carry on out of sight, and joining the
 * loose ends would draw an edge it does not have. The area inside such a
 * shape is {@link areaFor}.
 */
export declare function pathFor(points: readonly LonLat[], viewport: Viewport, options?: PathOptions): string;

declare interface PathOptions {
    interpolate?: Interpolation;
    /** Degrees of arc per step. Smaller is smoother and slower; the default
     *  keeps a full-frame curve visually smooth without flooding the path. */
    stepDeg?: number;
    /** Join the last point back to the first. */
    closed?: boolean;
}

/** Two unit vectors across the plane at right angles to `normal` and to each
 *  other. Any direction at all does for the first one as long as it is not the
 *  normal itself, so the ecliptic pole stands in wherever the normal is. */
export declare function planeBasis(normal: OffsetKm): [OffsetKm, OffsetKm];

export declare interface Polygon extends Shape {
    /** Replace the outline, keeping everything else. */
    setPoints(points: readonly OffsetKm[]): void;
}

export declare interface PolygonOptions extends ShapeStyle {
    /** What carries the area: its points are measured from here. */
    anchor: Anchor;
    /** The outline in order, kilometres on ecliptic J2000 axes from the anchor.
     *  The last point joins back to the first; three or more, and fewer draws
     *  nothing. */
    points: readonly OffsetKm[];
}

export declare interface Polyline {
    /** Replace the points, keeping everything else. */
    setPoints(points: readonly OffsetKm[]): void;
    /** Move the line onto another place or body. */
    setAnchor(anchor: Anchor): void;
    setVisible(visible: boolean): void;
    remove(): void;
}

export declare interface PolylineOptions {
    /** What carries the line: its points are measured from here, so a line
     *  round a body travels with it. */
    anchor: Anchor;
    /** The line's points in order, kilometres on ecliptic J2000 axes from the
     *  anchor. Two or more; fewer draws nothing. */
    points: readonly OffsetKm[];
    /** CSS colour name or hex string. White when left out. */
    color?: string;
    /** Width in screen pixels, held at any distance. */
    widthPx?: number;
    /** 0 to 1. */
    opacity?: number;
    /** Fade the line toward its last point, the way an orbit trail fades
     *  behind a body. */
    fade?: boolean;
    /** Join the last point back to the first. */
    closed?: boolean;
}

export declare interface Projection {
    readonly id: ProjectionId;
    /** Meridian down the middle of the map. */
    readonly centerLon: number;
    /** True when the map's eastern and western edges are the same meridian, so a
     *  line drawn across the seam jumps the width of the world. */
    readonly cyclic: boolean;
    /** True when the world fills its whole extent, so a copy laid beside it
     *  meets its edge exactly. Only such a map is repeated east–west: setting a
     *  pointed world against its own curve leaves lens-shaped gaps and reads as
     *  two worlds rather than one carrying on, so those are drawn once and
     *  panning stops at the edge instead of wrapping. */
    readonly rectangular: boolean;
    /** True when the world is a disc rather than a rectangle: the corners of the
     *  extent are outside the map, and a point can be hidden behind the globe. */
    readonly azimuthal: boolean;
    readonly extent: Extent;
    /** Plane coordinates, or null where the place is not on the map. */
    forward(lon: number, lat: number): [number, number] | null;
    /** Longitude and latitude, or null where the plane point is off the world. */
    inverse(x: number, y: number): [number, number] | null;
    /** The whole row at `y` at once, or null where no part of it is on the map.
     *  Only the projections that map a row to a single parallel have one; the
     *  two that show a globe do not, and are resampled pixel by pixel. */
    rowInverse?(y: number): ProjectionRow | null;
}

/** The ids, in the order above. Read off the builders so a projection cannot be
 *  added and then go unoffered and untested. */
export declare const PROJECTION_IDS: readonly ProjectionId[];

/** Width over height of the whole world, for sizing a frame that holds it. */
export declare function projectionAspect(projection: Projection): number;

/**
 * Projections for the flat map: degrees of longitude and latitude onto a
 * plane, and back. Each one is a pure pair of functions plus the extent its
 * world fills. The view, the raster warp and the vector overlay are all
 * written against that shape, so a new projection needs nothing but a new
 * entry here.
 *
 * Longitude is east-positive and latitude is north-positive, matching the IAU
 * planetographic convention the export uses.
 */
export declare type ProjectionId = 'equirectangular' | 'equalEarth' | 'mollweide' | 'sinusoidal' | 'robinson' | 'orthographic' | 'stereographic';

export declare interface ProjectionOptions {
    /** Meridian down the middle of the map. */
    centerLon?: number;
    /** Parallel at the middle. Azimuthal projections only — the cylindrical and
     *  pseudocylindrical ones are always centred on the equator. */
    centerLat?: number;
    /** Degrees from the centre past which the map is blank. Azimuthal only;
     *  ignored elsewhere, where the whole world always fits. */
    clipAngle?: number;
}

/**
 * A whole row of the plane resolved at once, for the projections where that is
 * possible: on a cylindrical or pseudocylindrical map every point of a row
 * lies on one parallel, and longitude runs linearly across it.
 *
 * That turns the resampling walk from one inverse projection per pixel into
 * one per row plus a multiply, which is most of what the flat map costs.
 */
declare interface ProjectionRow {
    /** The parallel this row of the plane falls on. */
    lat: number;
    /** Degrees of longitude per unit of abscissa, from the central meridian. */
    lonPerX: number;
    /** Abscissa past which the row leaves the map — half the world's width at
     *  this latitude, which narrows toward the poles on a pointed projection. */
    maxAbsX: number;
}

declare interface RasterLayer {
    readonly kind: 'raster';
    id: string;
    label: string;
    visible: boolean;
    opacity: number;
    blend: 'normal' | 'add';
    credit?: LayerCredit;
    /** The picture to draw for a moment in time, at a resolution tier. Bundles
     *  that do not change with either ignore both. */
    url(jd: number, tier: string): string;
    /** Tiers the bundle was actually written at. */
    tiers: readonly string[];
}

declare type ResolvedAtmosphereTier = 'low' | 'medium' | 'high' | 'ultra';

/**
 * A list of states the map reads between. Between two states the path is a
 * cubic through both of them, tangent to the slope each state's neighbours
 * imply — the smooth curve a coasting object actually follows, where a
 * straight line between states would cut every corner of an orbit. Outside the
 * range the states cover the object is not drawn: a list that has run out is
 * not evidence of where anything is.
 */
export declare function samples(options: SamplesOptions): InertialAnchor;

export declare interface SamplesOptions {
    /** What the states are measured from; the Sun when left out. */
    body?: string;
    /** Two or more states. They are sorted by date, so they may be given in any
     *  order; fewer than two places nothing. */
    samples: readonly TrajectorySample[];
}

/**
 * The display settings the scene reads. The app's persisted store satisfies
 * this structurally; an embed passes its own or takes the default. One per
 * page, registered through {@link setSceneSettings}: the tier and quality
 * helpers run deep in material code with no map instance at hand.
 */
export declare interface SceneSettings {
    resolvedReducedMotion: boolean;
    viewMode: 'map' | 'immersive';
    showClouds: boolean;
    showAtmospheres: boolean;
    atmosphereQuality: AtmosphereQualityTier;
    atmosphereAutoTier: ResolvedAtmosphereTier | null;
    atmosphereCalibration: AtmosphereCalibration | null;
    atmoQualityOverrides: Partial<AtmosphereQualityConfig>;
    highAmbient: boolean;
    realisticLighting: boolean;
    overexposeRings: boolean;
    showShapeMesh: boolean;
    showSurfaceTexture: boolean;
    showDisplacement: boolean;
    showSelfShadow: boolean;
    showHaloDebug: boolean;
    maxPartsPerZone: number;
    /** Written by the boot calibration and the perf governor. */
    setAtmosphereCalibration(v: AtmosphereCalibration | null): void;
    setAtmosphereAutoTier(v: ResolvedAtmosphereTier | null): void;
}

/** Where an arrow sits on screen, for a label the host hangs beside it. */
export declare interface ScreenAnchor {
    x: number;
    y: number;
    /** In front of the camera and inside the frame. */
    visible: boolean;
}

/** A drawing on the map, for as long as the host keeps it. */
export declare interface Shape {
    /** Move it onto another place or body. */
    setAnchor(anchor: Anchor): void;
    /** Show or hide it without giving up its place. */
    setVisible(visible: boolean): void;
    remove(): void;
}

export declare interface ShapeStyle {
    /** Any CSS colour. White when left out. */
    color?: string;
    /** Outline width in screen pixels, held at any distance. Zero leaves the
     *  outline out, for an area drawn as a fill alone. */
    widthPx?: number;
    /** 0 to 1, over the outline. */
    opacity?: number;
    /** Fill colour for an area. An area is filled in its own colour unless it
     *  says otherwise; a circle is a ring until it is given one. */
    fill?: string;
    /** 0 to 1, over the fill. */
    fillOpacity?: number;
}

/**
 * Simulation clock. Advances Julian Date by real elapsed time × timeScale;
 * timeScale === 0 means paused. `play()` re-resumes the previous non-zero scale.
 */
export declare class SimClock {
    jd: number;
    timeScale: number;
    direction: 1 | -1;
    /* Excluded from this release type: seeked */
    /* Excluded from this release type: jumps */
    /* Excluded from this release type: settledJd */
    /** True while the clock still tracks wall-clock time: started at now and
     *  never paused, jumped, reversed or run at another speed since. The URL
     *  writes `now` instead of a date while this holds, so a shared link stays
     *  live. */
    live: boolean;
    private lastRealMs;
    private prevScale;
    private stops;
    private settleTimer;
    constructor(initialJd: number, live?: boolean);
    /* Excluded from this release type: tick */
    /* Excluded from this release type: setBoundaryStops */
    /** Caller passes the unsigned magnitude; direction is applied here. */
    setTimeScale(magnitude: number): void;
    toggleDirection(): void;
    /* Excluded from this release type: setJD */
    /** Seek, and mark it as a discrete jump so listeners can react to the one
     *  move rather than to a stream of them. */
    jumpTo(jd: number): void;
    /** Rest the settled date on where the clock stands now. */
    private settle;
    /** The same, once a drag holds still. A clock still playing is left alone: it
     *  never comes to rest, and the pause that ends it settles it anyway. */
    private settleAfterPause;
    /* Excluded from this release type: sweepTo */
    pause(): void;
    play(): void;
    /** Back to wall-clock time; live again only if playback is at 1×, since a
     *  paused or fast clock drifts off it at once. */
    now(): void;
    get playing(): boolean;
    /** The moment the map is showing. */
    get date(): Date;
    /** Show another moment, as one deliberate move. */
    setDate(date: Date): void;
}

/**
 * A ring of places all the same angular distance from a centre — the flat
 * map's circle, which is a circle on the globe and rarely one on the plane.
 *
 * Swept as a rotation in three dimensions rather than by the spherical
 * bearing formula, which divides by the cosine of the centre's latitude and so
 * collapses a cap drawn round a pole onto a single meridian.
 */
export declare function smallCircle(center: LonLat, radiusDeg: number, steps?: number): LonLat[];

export declare class SpaceMap {
    /* Excluded from this release type: ctx */
    readonly clock: SimClock;
    /* Excluded from this release type: initialView */
    /* Excluded from this release type: renderer */
    /* Excluded from this release type: webglError */
    /* Excluded from this release type: contextLost */
    /* Excluded from this release type: focusedBody */
    /* Excluded from this release type: attribution */
    /** Objects of the host's own: a spacecraft, a station, a body the export
     *  has never heard of. */
    readonly objects: MapObjects;
    /** Dragging to turn the camera round the focused body. A two-finger drag and
     *  a right-drag go with it: they are the same gesture to a reader told the
     *  camera does not move. */
    readonly dragRotate: GestureHandler;
    /** The wheel and the pinch. */
    readonly scrollZoom: GestureHandler;
    /** Arrow keys to turn, +/− to zoom, on the focused canvas. */
    readonly keyboard: GestureHandler;
    /** Clicking an object to focus it. */
    readonly bodySelect: GestureHandler;
    /** Clicking a named surface feature, which the map reports as a
     *  `featureselect` event. */
    readonly featureSelect: GestureHandler;
    /** The wheel and one finger belong to the page, not the map. */
    readonly cooperativeGestures: GestureHandler;
    private container;
    private canvas;
    private labelLayer;
    private stopWatching;
    private controls;
    private lostPanelTimer;
    private cooperative;
    private limits;
    private initialFocusPending;
    private pendingFocusId;
    /** Retires the host's hold on the camera. Kept so that a second hold, or
     *  unmounting, can take the camera off the hold before it. */
    private retireCameraHold;
    private readonly listeners;
    constructor(options?: SpaceMapOptions);
    /** Listen for `event`. The returned function stops listening, which is the
     *  same thing {@link off} does. */
    on<K extends keyof MapEvents>(event: K, listener: MapEvents[K]): () => void;
    /** Listen for the next `event` only. */
    once<K extends keyof MapEvents>(event: K, listener: MapEvents[K]): () => void;
    off<K extends keyof MapEvents>(event: K, listener: MapEvents[K]): void;
    private emit;
    /** What the map knows about an object it has loaded; undefined for one it
     *  has not, which for a small body may simply mean not yet. */
    getBody(id: string): Body_2 | undefined;
    /** The object the camera orbits. A surface feature reports its host body. */
    getFocusedBody(): Body_2 | undefined;
    /** Ids of the objects orbiting `id` that this map has loaded. Loading is
     *  driven by focus and by the clock, so the list grows as the reader moves. */
    getChildren(id: string): string[];
    /* Excluded from this release type: load */
    /* Excluded from this release type: open */
    /* Excluded from this release type: applyInitialView */
    /* Excluded from this release type: mount */
    /** Hang a control in one of the map's corners; top-right unless the control
     *  or the caller names another. Adding the same control twice does nothing. */
    addControl(control: Control<SpaceMap>, position?: ControlPosition): this;
    /** Take a control back off. The credit line is not one a host may remove —
     *  the imagery terms the map draws under require it. */
    removeControl(control: Control<SpaceMap>): this;
    /** Stop rendering and take the map's DOM back out of the container. The map
     *  is finished afterwards; open another with {@link createMap}. */
    remove(): void;
    /* Excluded from this release type: unmount */
    /** Reactions that outlive any one caller. Each reads its signal before the
     *  renderer call so the dependency is tracked from the first run. */
    private watch;
    /* Excluded from this release type: applySettings */
    private callbacks;
    private readonly onKeyDown;
    private readonly onContextLost;
    private readonly onContextRestored;
    private readonly onVisibility;
    /**
     * Fly the camera to a body, or to a named feature on one. Resolves when the
     * flight lands. Whatever the target leaves out the map frames itself, so
     * `{ body }` alone is the ordinary way to move.
     */
    flyTo(target: CameraTarget): Promise<void>;
    /** Turn to a feature on the body already framed, without travelling to it —
     *  the move a click on its label makes. Resolves when the camera comes
     *  round. */
    panTo(target: FeatureTarget): Promise<void>;
    /** Put the camera somewhere at once, with no flight: what a page restoring a
     *  stored view wants, where a flight from nowhere would read as a lurch. */
    jumpTo(target: JumpTarget): this;
    /** Where the camera is now. Null before the first frame, and while nothing
     *  is focused. */
    getCamera(): CameraState | null;
    /**
     * Switch a layer on or off. The change is a drawing decision and lands on
     * the next frame: nothing is fetched, whatever is switched on.
     *
     * That is the other half of the `layers` option, which is a downloading
     * decision — a layer switched off there is never fetched, so switching it
     * back on here shows nothing. Switch off at open time what the map is not
     * for, and switch here what the reader is to have a say in.
     */
    setLayerVisible(id: MapLayerId, visible: boolean): this;
    isLayerVisible(id: MapLayerId): boolean;
    /** Every layer id, so a switcher can be built without spelling them out. */
    getLayers(): MapLayerId[];
    /** Earth's satellites and its debris ride one point cloud, so leaving one
     *  kind out means repacking it. Everything else is decided per frame. */
    private onLayerChange;
    /**
     * Replace the reader's limits, whole. What the new set leaves out is
     * unrestricted again, so `setLimits({})` lifts them all.
     *
     * Limits gate reader input only: a flight or a jump lands where it was told
     * to, and the reader's next gesture brings the camera back inside.
     */
    setLimits(limits: CameraLimits): this;
    /** The limits as they stand. */
    getLimits(): CameraLimits;
    private applyLimits;
    private applyGestures;
    /** A wheel the page is to keep never reaches the orbit controls. It is not
     *  cancelled, so the page scrolls as it would over any other element. */
    private readonly onWheelCapture;
    /** One finger is the page's; the orbit controls already ignore it, so this
     *  is only here to say why nothing moved. */
    private readonly onTouchMove;
    private toFeature;
    /** The focus controller reports how long its move takes. One frame past
     *  that: the camera is placed during the render after the move ends, so a
     *  host reading it the moment the flight is over would be a frame behind. */
    private settled;
    /** A move with no body named moves around the one already focused. */
    private targetBody;
    /** Camera distance in scene units: what was asked for, else a distance that
     *  frames the body, else where the camera already is. */
    private framing;
    /* Excluded from this release type: focusOnBody */
    /* Excluded from this release type: snapToBody */
    /* Excluded from this release type: snapToBodyFacing */
    /* Excluded from this release type: focusOnFeature */
    /* Excluded from this release type: setFocusTarget */
    /** Where the camera is and what it orbits, as anchors a host can store,
     *  change and hand back to {@link holdCamera}. Null before the first frame
     *  or while nothing is focused. */
    getPose(): CameraPose | null;
    /** Take the camera off the map's own controls and place it yourself. The
     *  focused body still decides what is drawn in detail, so hold and focus
     *  the same body when you move in close. */
    holdCamera(): CameraHold;
    /** Pin the host's own element to a place on the map. It is drawn in the
     *  map's label layer, so it pans with the scene and is removed with it. */
    addMarker(options: MarkerOptions): Marker;
    /** Draw a line on the map. Its points are measured from an anchor, so a
     *  line round a body travels with it. */
    addPolyline(options: PolylineOptions): Polyline;
    /** Draw an area on the map, measured from an anchor like a line. It is
     *  filled in its own colour unless the host says otherwise. */
    addPolygon(options: PolygonOptions): Polygon;
    /** Draw a circle round a place — an orbit's reach, a distance from a body.
     *  It is a ring rather than a disc unless the host asks for a fill, since
     *  what it is drawn round is usually the point. */
    addCircle(options: CircleOptions): Circle;
    /** Write a word at a place, in the map's own way of drawing one. A marker
     *  is for an element the host has styled itself. */
    addLabel(options: LabelOptions): Label;
    /** Draw a picture at a place. It holds its size on screen wherever the
     *  camera goes. */
    addIcon(options: IconOptions): Icon;
    /** Draw a line on a body's surface, following its curve and turning with
     *  it. The places are longitude and latitude, as the flat map's are. */
    addSurfacePolyline(options: SurfacePolylineOptions): SurfaceShape;
    /** Draw an area on a body's surface. It is filled in its own colour unless
     *  the host says otherwise, and closes itself. */
    addSurfacePolygon(options: SurfacePolygonOptions): SurfaceShape;
    /** Draw a cap on a body's surface: a footprint, a range, a horizon. */
    addSurfaceCircle(options: SurfaceCircleOptions): SurfaceShape;
    /** Remove every drawing the host has added, leaving the map itself alone.
     *  Objects the host has put on the map are not drawings and stay;
     *  {@link objects}.clear() takes those. */
    clearDrawings(): void;
    /**
     * Put the host's own pictures on a body the map already knows, in place of
     * the ones the export publishes: a surface map, lights for the unlit side,
     * a cloud layer. Each is a URL, and what is left out stays the map's own,
     * so `setBodyAppearance(id, {})` gives the body its own imagery back.
     *
     * A picture given here is what the body wears at every distance. The map's
     * own imagery is chosen by how much of the screen the body fills, and there
     * is nothing to choose once a host has said what it looks like.
     */
    setBodyAppearance(id: string, appearance: BodyAppearance): this;
    /** A cap's radius as an angle, from whichever of the two ways the host gave
     *  it. A radius in kilometres needs the body's own radius, which an
     *  unloaded body has not published yet. */
    private capRadiusDeg;
    /** Add a drawing and hand it the way back out. */
    private track;
    private requireCanvas;
    private requireRenderer;
    setNorthReference(id: string | null): void;
    setUserLocation(latitude: number, longitude: number): void;
    clearUserPromoted(): void;
    /* Excluded from this release type: setSelectedFeature */
    /* Excluded from this release type: setTravelPath */
    /* Excluded from this release type: setOrbitPreview */
    /* Excluded from this release type: setTravelHover */
    /* Excluded from this release type: focusOnPathPoint */
    /* Excluded from this release type: trackPathPoint */
    /** Stop drawing while opaque UI covers the map. */
    setCovered(covered: boolean): void;
}

export declare interface SpaceMapOptions {
    /** Display settings for the page; defaults suit a bare embed. */
    settings?: SceneSettings;
    /** Simulation start, wall-clock time when omitted. `live` keeps the clock
     *  on wall-clock time; defaults to true only when no date is given. */
    date?: Date;
    live?: boolean;
    /** Where the map opens. */
    view?: CameraOptions;
    /** Whether the reader may move the map at all. True unless it is said
     *  otherwise; false switches every gesture off. */
    interactive?: boolean;
    /** Gestures to start on or off one at a time, over whatever `interactive`
     *  said. Each is a handler on the map afterwards. */
    interactions?: Partial<Record<MapGesture, boolean>>;
    /** The map inside a page the reader scrolls past: the wheel scrolls the page
     *  unless ctrl (⌘ on a Mac) is held, and one finger drags the page rather
     *  than the map. A hint says so whenever the plain gesture is tried. */
    cooperativeGestures?: boolean;
    /** Where the reader may take the camera. Reader input only — see
     *  {@link SpaceMap.setLimits}. */
    limits?: CameraLimits;
    /** Which layers the map draws, by id; everything left out is drawn. A layer
     *  switched off here is never fetched — see {@link SpaceMap.setLayerVisible}
     *  for what that costs later. */
    layers?: Partial<Record<MapLayerId, boolean>>;
}

/** A place on (or above) the body's surface, turning with it. */
export declare interface SurfaceAnchor {
    body: string;
    latitude: number;
    longitude: number;
    /** Height above the body's mean radius; on the surface when left out. */
    altitudeKm?: number;
}

export declare interface SurfaceCircleOptions extends ShapeStyle {
    body: string;
    center: LonLat;
    /** Radius as an angle at the body's centre. */
    radiusDeg?: number;
    /** Radius along the surface. Needs the body's radius to be known; ignored
     *  when it is not. */
    radiusKm?: number;
    steps?: number;
    altitudeKm?: number;
}

export declare interface SurfacePolygonOptions extends SurfaceShapeOptions {
    /** Filled in its own colour when left out; an area on a body is drawn to be
     *  seen as one. */
    fill?: string;
}

export declare interface SurfacePolylineOptions extends SurfaceShapeOptions {
    /** Join the last place back to the first. */
    closed?: boolean;
}

/** A shape on a body's surface, for as long as the host keeps it. */
export declare interface SurfaceShape {
    /** Replace the places, keeping everything else. */
    setPoints(points: readonly LonLat[]): void;
    setVisible(visible: boolean): void;
    remove(): void;
}

export declare interface SurfaceShapeOptions extends ShapeStyle {
    /** Export id of the body it is drawn on. */
    body: string;
    /** The shape in longitude and latitude, degrees. The same list draws on the
     *  flat map. */
    points: readonly LonLat[];
    /** How the space between the given places is filled: along the parallels
     *  and meridians, or the short way over the surface. */
    interpolate?: Interpolation;
    /** Degrees of arc per step between the given places. Smaller is smoother
     *  and slower. */
    stepDeg?: number;
    /** Height above the surface. A little above it by default, so the shape is
     *  not lost in the surface's own depth; give it a height of its own for a
     *  track flown rather than walked. */
    altitudeKm?: number;
}

/**
 * Two lines of a NORAD element set, propagated with SGP4 — the model the
 * elements are fitted for, so a satellite's nodal drift and drag are in the
 * position rather than a mean ellipse. The orbit is round Earth, since that is
 * what a TLE describes.
 *
 * Accuracy falls away from the element set's epoch, a few days either side
 * being the usual working range. A set SGP4 will not take, and a date it
 * cannot be propagated to — a decayed satellite, most often — leave the object
 * undrawn.
 */
export declare function tle(line1: string, line2: string): InertialAnchor;

/** One state on a sampled trajectory: a date, and where the object was on it. */
export declare interface TrajectorySample {
    /** Julian date. */
    jd: number;
    /** Kilometres from the reference body on ecliptic J2000 axes. */
    km: OffsetKm;
}

export declare interface VectorLayer {
    readonly kind: 'vector';
    id: string;
    label: string;
    visible: boolean;
    credit?: LayerCredit;
    /** Fill `group` with what this layer looks like in this view. The group is
     *  emptied first, so a layer only ever adds. */
    render(viewport: Viewport, group: SVGGElement): void;
    /** Loading anything it needs. Re-rendered when it resolves. */
    prepare?(): Promise<void>;
    dispose?(): void;
}

/** Plane point a screen pixel would fall on, and back again. */
export declare class Viewport {
    readonly projection: Projection;
    readonly width: number;
    readonly height: number;
    readonly view: ViewState;
    /** Pixels per unit of the projection's plane. */
    readonly scale: number;
    constructor(projection: Projection, width: number, height: number, view: ViewState);
    toScreen(x: number, y: number): [number, number];
    fromScreen(px: number, py: number): [number, number];
    /** Screen pixel for a place, or null where it is not on the map. */
    project(lon: number, lat: number): [number, number] | null;
    /** Place under a screen pixel, or null where the pixel is off the world. */
    unproject(px: number, py: number): [number, number] | null;
    /** How wide the whole world is in pixels — the jump that tells a drawn line
     *  it has crossed the seam rather than moved. */
    get worldWidthPx(): number;
    /** Whether the map should be drawn again either side of itself. */
    get repeatsHorizontally(): boolean;
    /** Screen offsets of every copy of the world that reaches into the frame,
     *  the map's own always first. Anything drawn on the map is drawn once per
     *  offset, so a shape near the seam shows on both sides of it. */
    get repeatShifts(): number[];
}

export declare interface ViewState {
    /** 1 fits the whole world in the frame; 2 shows half of it. */
    zoom: number;
    /** Point of the plane the frame is centred on. */
    centerX: number;
    centerY: number;
}

export { }
