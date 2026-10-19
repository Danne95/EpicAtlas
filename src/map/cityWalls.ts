import type { CustomLayerInterface, CustomRenderMethodInput, Map as AtlasMap } from 'maplibre-gl';
import type { LocationCollection } from '../types/travel';
import type { TravelLayers } from './travelLayers';

const radius = 6371008.8;
interface Wall { id: string; faces: number[]; edges: number[] }

/** Vertical sheets along polygon rings, including holes; no roof over city interiors. */
export function cityWallGeometry(locations: LocationCollection): Wall[] {
  return locations.features.filter(feature => feature.geometry.type !== 'Point').map(feature => {
    const g = feature.geometry;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const wall: Wall = { id: feature.properties.id, faces: [], edges: [] };
    const vertex = (lon: number, lat: number, top: number) => {
      const longitude = lon * Math.PI / 180, latitude = lat * Math.PI / 180, cosine = Math.cos(latitude);
      const mercatorLatitude = Math.max(-85.051129, Math.min(85.051129, lat)) * Math.PI / 180;
      return [(lon + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + mercatorLatitude / 2)) / Math.PI) / 2,
        Math.sin(longitude) * cosine, Math.sin(latitude), Math.cos(longitude) * cosine, top, 1 / (2 * Math.PI * radius * Math.max(0.001, cosine))];
    };
    for (const polygon of polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const dx = ((b[0] - a[0] + 540) % 360) - 180, dy = b[1] - a[1];
      if (Math.hypot(dx, dy) < 1e-12) continue;
      const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), 1));
      for (let step = 0; step < steps; step++) {
        const t = step / steps, next = (step + 1) / steps;
        const a0 = vertex(a[0] + dx * t, a[1] + dy * t, 0), a1 = vertex(a[0] + dx * t, a[1] + dy * t, 1);
        const b0 = vertex(a[0] + dx * next, a[1] + dy * next, 0), b1 = vertex(a[0] + dx * next, a[1] + dy * next, 1);
        wall.faces.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
        wall.edges.push(...a1, ...b1);
      }
    }
    return wall;
  });
}

export function cityWallHeight(zoom: number): number {
  const stops = [[1, 120000], [4, 30000], [8, 2000], [12, 150], [16, 30]];
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (zoom <= stops[i][0]) {
    const t = (zoom - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
    return Math.exp(Math.log(stops[i - 1][1]) * (1 - t) + Math.log(stops[i][1]) * t);
  }
  return stops.at(-1)![1];
}

const vertexSource = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_mercator;
layout(location=1) in vec3 a_sphere;
layout(location=2) in vec2 a_height;
uniform mat4 u_matrix;
uniform mat4 u_fallback;
uniform float u_transition;
uniform float u_height;
out vec3 v_position;
out float v_height;
void main() {
  float height = a_height.x * u_height;
  v_position = a_sphere * (1.0 + height / 6371008.8);
  v_height = a_height.x;
  vec4 flatPosition = vec4(a_mercator, height * a_height.y, 1.0);
  gl_Position = u_transition > 0.0 ? mix(u_fallback * flatPosition, u_matrix * vec4(v_position, 1.0), u_transition) : u_matrix * flatPosition;
}`;
const fragmentSource = `#version 300 es
precision highp float;
uniform vec3 u_camera;
uniform float u_transition;
in vec3 v_position;
in float v_height;
out vec4 color;
void main() {
  if (u_transition > 0.98) {
    vec3 ray = v_position - u_camera;
    float distance = length(ray);
    float b = dot(u_camera, ray / distance);
    float discriminant = b*b - (dot(u_camera, u_camera) - 1.0);
    if (discriminant >= 0.0) {
      float hit = -b - sqrt(discriminant);
      if (hit > 0.0 && hit < distance - 0.0001) discard;
    }
  }
  float opacity = mix(0.18, 0.45, v_height);
  color = vec4(vec3(0.616, 0.902, 0.808) * opacity, opacity);
}`;

export class CityWalls implements CustomLayerInterface {
  readonly id = 'locations-walls';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map!: AtlasMap;
  private gl!: WebGL2RenderingContext;
  private program?: WebGLProgram;
  private buffer?: WebGLBuffer;
  private vao?: WebGLVertexArrayObject;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private walls: Wall[];
  private faceCount = 0;
  private edgeCount = 0;
  private readonly restore = () => { this.release(); this.initialize(); this.refresh(); };

  constructor(locations: LocationCollection, private groups: TravelLayers) { this.walls = cityWallGeometry(locations); }
  onAdd(map: AtlasMap, gl: WebGL2RenderingContext): void {
    this.map = map; this.gl = gl; this.initialize(); this.refresh(); map.on('webglcontextrestored', this.restore);
  }
  private initialize(): void {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`City wall shader: ${error}`); }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { const error = gl.getProgramInfoLog(program); gl.deleteProgram(program); throw new Error(`City wall program: ${error}`); }
    this.program = program;
    for (const name of ['u_matrix', 'u_fallback', 'u_transition', 'u_height', 'u_camera']) this.uniforms.set(name, gl.getUniformLocation(program, name));
    this.buffer = gl.createBuffer()!; this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [index, size, offset] of [[0, 2, 0], [1, 3, 8], [2, 2, 20]]) { gl.enableVertexAttribArray(index); gl.vertexAttribPointer(index, size, gl.FLOAT, false, 28, offset); }
    gl.bindVertexArray(null);
  }
  refresh(): void {
    if (!this.buffer) return;
    const visible = this.groups.isVisible('locations') ? this.walls.filter(wall => this.groups.isRecordVisible('locations', wall.id)) : [];
    const faces = visible.flatMap(wall => wall.faces), edges = visible.flatMap(wall => wall.edges);
    this.faceCount = faces.length / 7; this.edgeCount = edges.length / 7;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([...faces, ...edges]), this.gl.STATIC_DRAW);
    this.map.triggerRepaint();
  }
  render(gl: WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    if (!this.program || !this.faceCount || this.map.getProjection()?.type !== 'globe' || !this.groups.isVisible('locations')) return;
    const { mainMatrix, fallbackMatrix, projectionTransition, clippingPlane } = input.defaultProjectionData;
    gl.useProgram(this.program); gl.bindVertexArray(this.vao!);
    gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(this.uniforms.get('u_matrix')!, false, new Float32Array(Array.from(mainMatrix)));
    gl.uniformMatrix4fv(this.uniforms.get('u_fallback')!, false, new Float32Array(Array.from(fallbackMatrix)));
    gl.uniform1f(this.uniforms.get('u_transition')!, projectionTransition);
    gl.uniform1f(this.uniforms.get('u_height')!, cityWallHeight(this.map.getZoom()));
    gl.uniform3fv(this.uniforms.get('u_camera')!, clippingPlane.slice(0, 3).map(value => clippingPlane[3] ? value / -clippingPlane[3] : 0));
    gl.drawArrays(gl.TRIANGLES, 0, this.faceCount);
    gl.lineWidth(1); gl.drawArrays(gl.LINES, this.faceCount, this.edgeCount);
    gl.bindVertexArray(null);
  }
  private release(): void {
    this.gl.deleteBuffer(this.buffer ?? null); this.gl.deleteVertexArray(this.vao ?? null); this.gl.deleteProgram(this.program ?? null);
    this.buffer = undefined; this.vao = undefined; this.program = undefined; this.uniforms.clear();
  }
  onRemove(): void { this.map.off('webglcontextrestored', this.restore); this.release(); }
}
