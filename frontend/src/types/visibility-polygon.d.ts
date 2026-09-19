declare module 'visibility-polygon' {
  export type Point = [number, number];
  export type Segment = [Point, Point];

  export function compute(position: Point, segments: Segment[]): Point[];
  export function computeViewport(
    position: Point,
    segments: Segment[],
    viewportMin: Point,
    viewportMax: Point
  ): Point[];
  export function inPolygon(position: Point, polygon: Point[]): boolean;
  export function inViewport(position: Point, viewportMin: Point, viewportMax: Point): boolean;
  export function convertToSegments(polygons: Point[][]): Segment[];
  export function breakIntersections(segments: Segment[]): Segment[];

  const VisibilityPolygon: {
    compute: typeof compute;
    computeViewport: typeof computeViewport;
    inPolygon: typeof inPolygon;
    inViewport: typeof inViewport;
    convertToSegments: typeof convertToSegments;
    breakIntersections: typeof breakIntersections;
  };

  export default VisibilityPolygon;
}
