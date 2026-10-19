import type { ExpressionSpecification } from 'maplibre-gl';

/** Keep zoom at the top level, as required by MapLibre camera expressions. */
export function projectionPaint(stops: Array<[number, number | string, number | string]>): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], ...stops.flatMap(([zoom, flat, globe]) => [zoom, ['case', ['boolean', ['global-state', 'globe-view'], false], globe, flat]])] as ExpressionSpecification;
}
