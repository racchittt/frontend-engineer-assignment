export interface Camera {
  x: number;
  y: number;
  z: number;
}
export const MIN_Z = 0.25,
  MAX_Z = 4;

export const clampZoom = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

// keep the point (px, py) under the cursor fixed while zoom changes
export function zoomAt(
  cam: Camera,
  px: number,
  py: number,
  newZ: number,
): Camera {
  const z = clampZoom(newZ);
  const k = z / cam.z;
  return { x: px - (px - cam.x) * k, y: py - (py - cam.y) * k, z };
}

export const panBy = (cam: Camera, dx: number, dy: number): Camera => ({
  ...cam,
  x: cam.x + dx,
  y: cam.y + dy,
});
