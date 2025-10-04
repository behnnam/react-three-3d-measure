import React, { useState, useCallback, useRef, useEffect } from "react";
import { Canvas, useLoader, useThree, useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";

// ------------------------
// کمک‌کننده‌ها
// ------------------------
function polygonArea3D(points) {
  if (points.length < 3) return 0;
  let normal = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  return normal.length() / 2;
}

function calculateAngle(A, B, C) {
  const BA = new THREE.Vector3().subVectors(A, B);
  const BC = new THREE.Vector3().subVectors(C, B);
  const cosTheta = BA.dot(BC) / (BA.length() * BC.length());
  const angleRad = Math.acos(Math.min(Math.max(cosTheta, -1), 1));
  return (angleRad * 180) / Math.PI;
}

// ------------------------
// InteractionController
// ------------------------
function InteractionController({ objects, points, setPoints, mode, setTempPoint }) {
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster()).current;
  const [lockedPlane, setLockedPlane] = useState(null);

  const SNAP_THRESHOLD = 0.1;

  const snapToVerticesAndEdges = (face, object, point) => {
    const geom = face && object.geometry;
    if (!geom || !geom.attributes.position) return point;
    const positions = geom.attributes.position.array;
    let closest = point.clone();
    let minDist = Infinity;

    // ---------- چسبندگی به رئوس ----------
    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      vertex.applyMatrix4(object.matrixWorld);
      const dist = vertex.distanceTo(point);
      if (dist < SNAP_THRESHOLD && dist < minDist) {
        closest = vertex.clone();
        minDist = dist;
      }
    }

    // ---------- چسبندگی به لبه‌ها ----------
    for (let i = 0; i < positions.length; i += 9) { // هر فیس 3 راس
      const v0 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(object.matrixWorld);
      const v1 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]).applyMatrix4(object.matrixWorld);
      const v2 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]).applyMatrix4(object.matrixWorld);

      [[v0, v1], [v1, v2], [v2, v0]].forEach(([a, b]) => {
        const ab = new THREE.Vector3().subVectors(b, a);
        const t = ab.dot(new THREE.Vector3().subVectors(point, a)) / ab.lengthSq();
        if (t >= 0 && t <= 1) {
          const proj = new THREE.Vector3().copy(a).add(ab.multiplyScalar(t));
          const dist = proj.distanceTo(point);
          if (dist < SNAP_THRESHOLD && dist < minDist) {
            closest = proj.clone();
            minDist = dist;
          }
        }
      });
    }

    return closest;
  };


  const snapToVertices = (face, object, point) => {
    const geom = face && object.geometry;
    if (!geom || !geom.attributes.position) return point;
    const positions = geom.attributes.position.array;
    let closest = point.clone();
    let minDist = Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      vertex.applyMatrix4(object.matrixWorld);
      const dist = vertex.distanceTo(point);
      if (dist < SNAP_THRESHOLD && dist < minDist) {
        closest = vertex.clone();
        minDist = dist;
      }
    }

    return closest;
  };

  const handleMove = useCallback(
    (event) => {
      if (!objects || objects.length === 0) {
        setTempPoint(null);
        return;
      }
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x, y }, camera);
      const intersects = raycaster.intersectObjects(objects, true);
      if (!intersects.length) {
        setTempPoint(null);
        return;
      }

      const hit = intersects[0];
      let point = hit.point.clone();

      if (mode === "face" && lockedPlane) {
        const { normal, planePoint } = lockedPlane;
        const dist = normal.dot(point.clone().sub(planePoint));
        if (Math.abs(dist) > 1e-3) {
          setTempPoint(null);
          return;
        }
      }

      // if (mode === "face") point = snapToVertices(hit.face, hit.object, point);
      if (mode === "face") point = snapToVerticesAndEdges(hit.face, hit.object, point);

      setTempPoint(point);
    },
    [camera, gl, objects, mode, raycaster, lockedPlane, setTempPoint]
  );

  const handleClick = useCallback(
    (event) => {
      if (!objects || objects.length === 0) return;

      const rect = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x, y }, camera);
      const intersects = raycaster.intersectObjects(objects, true);
      if (!intersects.length) return;

      const hit = intersects[0];
      let point = hit.point.clone();

      if (mode === "face") {
        if (!lockedPlane && points.length === 0) {
          const worldNormal = hit.face.normal
            .clone()
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
            .normalize();
          setLockedPlane({ normal: worldNormal, planePoint: point.clone() });
        } else if (lockedPlane) {
          const { normal, planePoint } = lockedPlane;
          const dist = normal.dot(point.clone().sub(planePoint));
          if (Math.abs(dist) > 1e-3) return;
        }

        point = snapToVertices(hit.face, hit.object, point);
      }

      setPoints((prev) => [...prev, point]);
      setTempPoint(null);
    },
    [camera, gl, objects, mode, points, raycaster, lockedPlane, setPoints]
  );

  useEffect(() => {
    if (mode !== "face" || points.length === 0) setLockedPlane(null);
  }, [mode, points.length]);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("click", handleClick);
    return () => {
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("click", handleClick);
    };
  }, [gl, handleMove, handleClick]);

  return null;
}

// ------------------------
// OverlayProjector
// ------------------------
function OverlayProjector({ overlayRef, points, tempPoint, mode }) {
  const { camera, size } = useThree();
  const projectTo2D = (vec3) => {
    const vp = vec3.clone().project(camera);
    return {
      x: ((vp.x + 1) / 2) * size.width,
      y: ((1 - vp.y) / 2) * size.height,
      z: vp.z,
    };
  };

  useFrame(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.floor(size.width * dpr);
    const h = Math.floor(size.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const drawLine = (p0, p1, color = "white", width = 2) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    };

    const drawText = (x, y, text) => {
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const padding = 10;
      const tw = ctx.measureText(text).width + padding * 2;
      const th = 28;
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(x - tw / 2, y - th, tw, th);
      ctx.fillStyle = "white";
      ctx.fillText(text, x, y - 5);
    };

    function drawArc(center, p1, p2, color = "orange") {
      const c = projectTo2D(center);
      const p1_2d = projectTo2D(p1);
      const p2_2d = projectTo2D(p2);

      const v1 = { x: p1_2d.x - c.x, y: p1_2d.y - c.y };
      const v2 = { x: p2_2d.x - c.x, y: p2_2d.y - c.y };

      const startAngle = Math.atan2(v1.y, v1.x);
      const endAngle = Math.atan2(v2.y, v2.x);

      const cross = v1.x * v2.y - v1.y * v2.x;
      const anticlockwise = cross < 0;

      const radius = 40;
      ctx.beginPath();
      ctx.arc(c.x, c.y, radius, startAngle, endAngle, anticlockwise);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ------------------------
    // طول
    // ------------------------
    if (mode === "point") {
      if (points.length % 2 === 1 && tempPoint) {
        drawLine(projectTo2D(points[points.length - 1]), projectTo2D(tempPoint), "orange", 2);
        const tempDistFeet = ((points[points.length - 1].distanceTo(tempPoint) * 39.3701) / 12).toFixed(2);
        drawText(
          (projectTo2D(points[points.length - 1]).x + projectTo2D(tempPoint).x) / 2,
          (projectTo2D(points[points.length - 1]).y + projectTo2D(tempPoint).y) / 2,
          `${tempDistFeet} ft`
        );
      }

      for (let i = 0; i < points.length; i += 2) {
        if (points[i + 1]) {
          drawLine(projectTo2D(points[i]), projectTo2D(points[i + 1]), "yellow", 4);
          const distFeet = ((points[i].distanceTo(points[i + 1]) * 39.3701) / 12).toFixed(2);
          drawText(
            (projectTo2D(points[i]).x + projectTo2D(points[i + 1]).x) / 2,
            (projectTo2D(points[i]).y + projectTo2D(points[i + 1]).y) / 2,
            `${distFeet} ft`
          );
        }
      }
    }

    // ------------------------
    // زاویه
    // ------------------------
    if (mode === "angle") {
      if (points.length === 1 && tempPoint) {
        drawLine(projectTo2D(points[0]), projectTo2D(tempPoint), "orange", 2);
      }
      if (points.length >= 2) {
        drawLine(projectTo2D(points[0]), projectTo2D(points[1]), "yellow", 2);
      }
      if (points.length === 2 && tempPoint) {
        drawLine(projectTo2D(points[1]), projectTo2D(tempPoint), "orange", 2);
        const angle = calculateAngle(points[0], points[1], tempPoint).toFixed(2);
        drawArc(points[1], points[0], tempPoint);
        drawText(projectTo2D(points[1]).x, projectTo2D(points[1]).y, `${angle}°`);
      }
      if (points.length === 3) {
        drawLine(projectTo2D(points[1]), projectTo2D(points[2]), "yellow", 2);
        const angle = calculateAngle(points[0], points[1], points[2]).toFixed(2);
        drawArc(points[1], points[0], points[2]);
        drawText(projectTo2D(points[1]).x, projectTo2D(points[1]).y, `${angle}°`);
      }
    }

    // ------------------------
    // مساحت
    // ------------------------
    if (mode === "face") {
      const polyPoints = tempPoint ? [...points, tempPoint] : points;
      if (polyPoints.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(projectTo2D(polyPoints[0]).x, projectTo2D(polyPoints[0]).y);
        for (let i = 1; i < polyPoints.length; i++) {
          const p = projectTo2D(polyPoints[i]);
          ctx.lineTo(p.x, p.y);
        }
        if (polyPoints.length >= 3 || tempPoint) ctx.closePath();
        ctx.fillStyle = "rgba(0,200,255,0.3)";
        ctx.fill();
        ctx.strokeStyle = "orange";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (polyPoints.length >= 3) {
        const areaFeet = ((polygonArea3D(polyPoints) * 1550.0031) / 144).toFixed(2);
        const centroid = polyPoints.reduce((acc, p) => acc.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / polyPoints.length);
        drawText(projectTo2D(centroid).x, projectTo2D(centroid).y, `${areaFeet} ft²`);
      }
    }
  });

  return null;
}

// ------------------------
// کامپوننت اصلی
// ------------------------
function ShowModels() {
  const [points, setPoints] = useState([]);
  const [tempPoint, setTempPoint] = useState(null);
  const [mode, setMode] = useState("point");
  const modelGroup = useRef();
  const cubeRef = useRef();
  const overlayRef = useRef();

  let cursorStyle = "default";
  if (mode === "point") cursorStyle = "crosshair";
  else if (mode === "angle") cursorStyle = "alias";
  else if (mode === "face") cursorStyle = "pointer";

  const draco = new DRACOLoader();
  draco.setDecoderPath("./draco/");
  const model = useLoader(GLTFLoader, `./models/t.glb`, (loader) => loader.setDRACOLoader(draco));

  const objects = [];
  if (modelGroup.current) objects.push(modelGroup.current);
  if (cubeRef.current) objects.push(cubeRef.current);

  return (
    <div className="w-screen h-screen relative bg-slate-50" style={{ cursor: cursorStyle }}>
      <Canvas shadows camera={{ position: [5, 5, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <OrbitControls />

        <group ref={modelGroup} scale={[1, 1, 1]} position={[0, 0, 0]}>
          <primitive object={model.scene} />
        </group>

        <mesh ref={cubeRef} position={[3, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="lightblue" />
        </mesh>

        {points.map((point, index) => (
          <Html key={index} position={point} center style={{ transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
            <div
              style={{
                width: "30px",
                height: "30px",
                background: "rgba(0,200,255,0.8)",
                borderRadius: "50%",
                border: "2px solid white",
                boxShadow: "0 0 10px rgba(0,200,255,0.7)",
              }}
            />
          </Html>
        ))}

        <InteractionController objects={objects} points={points} setPoints={setPoints} mode={mode} setTempPoint={setTempPoint} />
        <OverlayProjector overlayRef={overlayRef} points={points} tempPoint={tempPoint} mode={mode} />

      </Canvas>

      <canvas ref={overlayRef} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50 }} />

      <div className="absolute top-4 right-4 flex gap-3 bg-white/90 p-2 rounded shadow">
        <button className={`w-12 h-12 flex items-center justify-center text-xl rounded ${mode === "point" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={() => { setPoints([]); setMode("point"); }} title="طول">📏</button>
        <button className={`w-12 h-12 flex items-center justify-center text-xl rounded ${mode === "face" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={() => { setPoints([]); setMode("face"); }} title="مساحت">🟩</button>
        <button className={`w-12 h-12 flex items-center justify-center text-xl rounded ${mode === "angle" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={() => { setPoints([]); setMode("angle"); }} title="زاویه">📐</button>
        <button className="w-12 h-12 flex items-center justify-center text-xl rounded bg-gray-200" onClick={() => setPoints([])} title="پاک کردن">❌</button>
      </div>
    </div>
  );
}

export default ShowModels;
