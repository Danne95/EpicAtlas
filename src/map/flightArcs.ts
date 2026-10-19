import type { CustomLayerInterface, CustomRenderMethodInput, Map as AtlasMap } from 'maplibre-gl';
import type { FlightRecord as Flight } from '../types/travel';
import type { TravelLayers } from './travelLayers';
import { arcPointVisible, flightArcPoints, type ArcPoint, type Vector3 } from './flightArcGeometry';

const vertexSource = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_other;
layout(location=2) in vec3 a_style;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_width;
out vec3 v_position;
out float v_edge;
out float v_progress;
void main() {
  vec4 p = u_matrix * vec4(a_position, 1.0);
  vec4 q = u_matrix * vec4(a_other, 1.0);
  vec2 tangent = (q.xy / q.w - p.xy / p.w) * u_viewport * a_style.y;
  float length = max(length(tangent), 0.00001);
  vec2 normal = vec2(-tangent.y, tangent.x) / length;
  p.xy += normal * a_style.x * u_width / u_viewport * p.w;
  gl_Position = p;
  v_position = a_position;
  v_edge = a_style.x;
  v_progress = a_style.z;
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform vec3 u_camera;
uniform float u_opacity;
uniform float u_glow;
in vec3 v_position;
in float v_edge;
in float v_progress;
out vec4 color;
void main() {
  vec3 ray = v_position - u_camera;
  float distance = length(ray);
  vec3 direction = ray / distance;
  float b = dot(u_camera, direction);
  float discriminant = b*b - (dot(u_camera, u_camera) - 1.0);
  if (discriminant >= 0.0) {
    float hit = -b - sqrt(discriminant);
    if (hit > 0.0 && hit < distance - 0.0001) discard;
  }
  float edge = abs(v_edge);
  float alpha = mix(1.0 - smoothstep(0.6, 1.0, edge), exp(-4.5*edge*edge) * (1.0-smoothstep(0.8,1.0,edge)), u_glow) * u_opacity;
  vec3 tint = mix(vec3(0.35, 0.85, 1.0), vec3(0.8, 0.7, 1.0), v_progress);
  tint = mix(mix(tint, vec3(0.92, 0.98, 1.0), 0.65), tint, u_glow);
  color = vec4(tint * alpha, alpha);
}`;

interface Arc { flight: Flight; points: ArcPoint[] }

/** GPU ribbons in sphere coordinates: actual height, soft edges and globe occlusion. */
export class FlightArcs implements CustomLayerInterface {
  readonly id = 'flights-elevated';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map!: AtlasMap;
  private gl!: WebGL2RenderingContext;
  private program?: WebGLProgram;
  private buffer?: WebGLBuffer;
  private vao?: WebGLVertexArrayObject;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private arcs: Arc[];
  private visibleArcs: Arc[] = [];
  private count = 0;
  private matrix?: ArrayLike<number>;
  private camera?: Vector3;
  private opacity = 0;
  private readonly restore = () => { this.release(); this.initialize(); this.refresh(); };

  constructor(flights: Flight[], private groups: TravelLayers) {
    this.arcs = flights.map(flight => ({ flight, points: flightArcPoints(flight) }));
  }

  onAdd(map: AtlasMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    this.initialize();
    this.refresh();
    map.on('webglcontextrestored', this.restore);
  }

  private initialize(): void {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Flight arc shader: ${message}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { const message = gl.getProgramInfoLog(program); gl.deleteProgram(program); throw new Error(`Flight arc program: ${message}`); }
    this.program = program;
    for (const name of ['u_matrix', 'u_viewport', 'u_width', 'u_camera', 'u_opacity', 'u_glow']) this.uniforms.set(name, gl.getUniformLocation(program, name));
    this.buffer = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
    gl.bindVertexArray(null);
  }

  refresh(): void {
    if (!this.buffer) return;
    this.visibleArcs = this.groups.isVisible('flights') ? this.arcs.filter(arc => this.groups.isRecordVisible('flights', arc.flight.id)) : [];
    const vertices: number[] = [];
    for (const arc of this.visibleArcs) {
      for (let i = 0; i < arc.points.length - 1; i++) {
        const a = arc.points[i], b = arc.points[i + 1];
        if (Math.hypot(...a.position.map((value, axis) => value - b.position[axis])) < 1e-7) continue;
        const vertex = (point: ArcPoint, other: ArcPoint, side: number, direction: number) => vertices.push(...point.position, ...other.position, side, direction, point.progress);
        vertex(a, b, -1, 1); vertex(a, b, 1, 1); vertex(b, a, -1, -1);
        vertex(b, a, -1, -1); vertex(a, b, 1, 1); vertex(b, a, 1, -1);
      }
    }
    this.count = vertices.length / 9;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
    this.map.triggerRepaint();
  }

  render(gl: WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    this.opacity = this.map.getProjection()?.type === 'globe' ? Math.max(0, Math.min(1, (6 - this.map.getZoom()) / 2)) : 0;
    if (input.defaultProjectionData.projectionTransition < 0.999) this.opacity = 0;
    if (!this.program || !this.count || !this.opacity || !this.groups.isVisible('flights')) return;
    const { mainMatrix, clippingPlane } = input.defaultProjectionData;
    this.matrix = mainMatrix;
    this.camera = clippingPlane.slice(0, 3).map(value => value / -clippingPlane[3]) as Vector3;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao!);
    gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(this.uniforms.get('u_matrix')!, false, new Float32Array(Array.from(mainMatrix)));
    gl.uniform2f(this.uniforms.get('u_viewport')!, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform3fv(this.uniforms.get('u_camera')!, this.camera);
    const pixelRatio = gl.drawingBufferWidth / this.map.getCanvas().clientWidth;
    for (const [width, opacity, glow] of [[12, 0.42, 1], [2.4, 0.95, 0]]) {
      gl.uniform1f(this.uniforms.get('u_width')!, width * pixelRatio);
      gl.uniform1f(this.uniforms.get('u_opacity')!, opacity * this.opacity);
      gl.uniform1f(this.uniforms.get('u_glow')!, glow);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
    }
    gl.bindVertexArray(null);
  }

  pick(point: { x: number; y: number }): Flight | undefined {
    if (!this.matrix || !this.camera || !this.opacity || this.map.getProjection()?.type !== 'globe' || !this.groups.isVisible('flights')) return;
    const matrix = this.matrix, camera = this.camera;
    const { clientWidth: width, clientHeight: height } = this.map.getCanvas();
    const project = (position: Vector3) => {
      const p = [...position, 1];
      const clip = [0, 1, 2, 3].map(row => p.reduce((sum, value, column) => sum + value * matrix[column * 4 + row], 0));
      return clip[3] > 0 ? [(clip[0] / clip[3] + 1) * width / 2, (1 - clip[1] / clip[3]) * height / 2] : undefined;
    };
    let nearest: Flight | undefined, best = 9;
    for (const arc of this.visibleArcs) {
      if (!this.groups.isRecordVisible('flights', arc.flight.id)) continue;
      for (let i = 0; i < arc.points.length - 1; i++) {
        const a = arc.points[i].position, b = arc.points[i + 1].position;
        const screenA = project(a), screenB = project(b);
        if (!screenA || !screenB) continue;
        const dx = screenB[0] - screenA[0], dy = screenB[1] - screenA[1];
        const t = Math.max(0, Math.min(1, ((point.x - screenA[0]) * dx + (point.y - screenA[1]) * dy) / (dx * dx + dy * dy || 1)));
        const distance = Math.hypot(point.x - screenA[0] - t * dx, point.y - screenA[1] - t * dy);
        const position = a.map((value, axis) => value + (b[axis] - value) * t) as Vector3;
        if (distance < best && arcPointVisible(position, camera)) { best = distance; nearest = arc.flight; }
      }
    }
    return nearest;
  }

  private release(): void {
    this.gl.deleteBuffer(this.buffer ?? null); this.gl.deleteVertexArray(this.vao ?? null); this.gl.deleteProgram(this.program ?? null);
    this.buffer = undefined; this.vao = undefined; this.program = undefined;
    this.matrix = undefined; this.camera = undefined; this.uniforms.clear();
  }

  onRemove(): void { this.map.off('webglcontextrestored', this.restore); this.release(); }
}
