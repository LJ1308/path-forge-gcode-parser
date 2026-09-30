import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ParseResult, Segment } from "../gcode/types";

/** G-code is Z-up; Three.js is Y-up — map bed onto XZ, height onto Y. */
function gcodeXYZ(x: number, y: number, z: number): [number, number, number] {
  return [x, z, y];
}

const COLORS: Record<Segment["kind"], number> = {
  extrude: 0x3dd68c,
  travel: 0x4a5568,
  retract: 0xf6ad55,
  unretract: 0x63b3ed,
};

export class ToolpathViewer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private meshGroup: THREE.Group;
  private bed: THREE.LineSegments | null = null;
  private resizeObserver: ResizeObserver;
  private animationId = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1419);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.camera.position.set(120, 120, 120);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(1, 2, 1);
    this.scene.add(ambient, dir);

    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  clear() {
    while (this.meshGroup.children.length) {
      const child = this.meshGroup.children[0];
      this.meshGroup.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    if (this.bed) {
      this.scene.remove(this.bed);
      this.bed.geometry.dispose();
      (this.bed.material as THREE.Material).dispose();
      this.bed = null;
    }
  }

  load(result: ParseResult, maxLayerZ: number | null, frameCamera = true) {
    this.clear();

    const segments = filterByLayer(result.segments, maxLayerZ);
    if (segments.length === 0) return;

    const byKind = new Map<Segment["kind"], number[]>();
    for (const kind of Object.keys(COLORS) as Segment["kind"][]) {
      byKind.set(kind, []);
    }

    for (const seg of segments) {
      const arr = byKind.get(seg.kind)!;
      const [fx, fy, fz] = gcodeXYZ(seg.from.x, seg.from.y, seg.from.z);
      const [tx, ty, tz] = gcodeXYZ(seg.to.x, seg.to.y, seg.to.z);
      arr.push(fx, fy, fz, tx, ty, tz);
    }

    for (const [kind, positions] of byKind) {
      if (positions.length === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      const material = new THREE.LineBasicMaterial({
        color: COLORS[kind],
        transparent: kind === "travel",
        opacity: kind === "travel" ? 0.35 : 1,
      });
      const lines = new THREE.LineSegments(geometry, material);
      this.meshGroup.add(lines);
    }

    const { min, max } = result.stats;
    this.addBuildPlate(min, max);
    if (frameCamera) this.frameCamera(min, max);
  }

  private addBuildPlate(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }) {
    const pad = Math.max(max.x - min.x, max.y - min.y) * 0.08 + 5;
    const gx0 = min.x - pad;
    const gx1 = max.x + pad;
    const gy0 = min.y - pad;
    const gy1 = max.y + pad;
    const gz = Math.min(min.z, 0);

    const corners: [number, number, number][] = [
      [gx0, gy0, gz],
      [gx1, gy0, gz],
      [gx1, gy1, gz],
      [gx0, gy1, gz],
      [gx0, gy0, gz],
    ];
    const points: number[] = [];
    for (let i = 0; i < corners.length - 1; i++) {
      const [x0, y0, z0] = gcodeXYZ(...corners[i]);
      const [x1, y1, z1] = gcodeXYZ(...corners[i + 1]);
      points.push(x0, y0, z0, x1, y1, z1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x2d3748 });
    this.bed = new THREE.LineSegments(geo, mat);
    this.scene.add(this.bed);
  }

  private frameCamera(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }) {
    this.resize();

    const c0 = gcodeXYZ(min.x, min.y, min.z);
    const c1 = gcodeXYZ(max.x, max.y, max.z);
    const box = new THREE.Box3(
      new THREE.Vector3(
        Math.min(c0[0], c1[0]),
        Math.min(c0[1], c1[1]),
        Math.min(c0[2], c1[2]),
      ),
      new THREE.Vector3(
        Math.max(c0[0], c1[0]),
        Math.max(c0[1], c1[1]),
        Math.max(c0[2], c1[2]),
      ),
    );

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    center.y = box.min.y + size.y * 0.35;
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    const fovRad = (this.camera.fov * Math.PI) / 180;
    const fitHeight = maxDim / (2 * Math.tan(fovRad / 2));
    const fitWidth = fitHeight / Math.max(this.camera.aspect, 0.01);
    const dist = Math.max(fitHeight, fitWidth) * 1.25;

    const viewDir = new THREE.Vector3(1, 0.62, 1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(viewDir, dist);

    this.camera.near = Math.max(dist / 200, 0.1);
    this.camera.far = Math.max(dist * 200, 1000);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  dispose() {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function filterByLayer(segments: Segment[], maxLayerZ: number | null): Segment[] {
  if (maxLayerZ === null) return segments;
  return segments.filter((s) => s.layerZ <= maxLayerZ + 0.001);
}
