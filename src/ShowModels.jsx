import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ------------------ محاسبه مساحت ------------------
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

// ------------------ محاسبه زاویه ------------------
function calculateAngle(A, B, C) {
  if (!A || !B || !C) return 0;
  const BA = new THREE.Vector3().subVectors(A, B);
  const BC = new THREE.Vector3().subVectors(C, B);
  return (BA.angleTo(BC) * 180) / Math.PI;
}

// ------------------ کامپوننت اصلی ------------------
export default function ShowModels() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  const [mode, setMode] = useState("point"); // point, angle, face
  const [points, setPoints] = useState([]);
  const [tempPoint, setTempPoint] = useState(null);

  const pointsRef = useRef([]);
  const tempPointRef = useRef(null);
  const modeRef = useRef(mode);
  const selectedMeshRef = useRef(null);

  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { tempPointRef.current = tempPoint; }, [tempPoint]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 5, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const draco = new DRACOLoader();
    draco.setDecoderPath("./draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load("./models/t.glb", (gltf) => modelGroup.add(gltf.scene));

    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const cubeMat = new THREE.MeshStandardMaterial({ color: "lightblue" });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.position.set(3, 0.5, 0);
    scene.add(cube);

    const objects = [modelGroup, cube];
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMove = (event) => {
      if (modeRef.current === "angle" && pointsRef.current.length >= 3) {
        setTempPoint(null);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(objects, true);

      if (modeRef.current === "face" && selectedMeshRef.current && intersects[0]?.object !== selectedMeshRef.current) {
        setTempPoint(null);
        return;
      }

      setTempPoint(intersects[0]?.point.clone() || null);
    };

    const handleClick = (event) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(objects, true);
      if (intersects.length === 0) return;

      const intersect = intersects[0];

      // --- حالت زاویه ---
      if (modeRef.current === "angle") {
        if (pointsRef.current.length >= 3) return;
        const newPoints = [...pointsRef.current, intersect.point.clone()];
        setPoints(newPoints);
        if (newPoints.length === 3) setTempPoint(null);
        return;
      }

      // --- حالت مساحت ---
      if (modeRef.current === "face") {
        if (!selectedMeshRef.current) {
          selectedMeshRef.current = intersect.object;
        } else if (intersect.object !== selectedMeshRef.current) {
          return; // اجازه انتخاب از وجوه دیگر یا مدل دیگر را نمی‌دهد
        }
        const newPoints = [...pointsRef.current, intersect.point.clone()];
        setPoints(newPoints);
        setTempPoint(null);
        return;
      }

      // --- حالت طول ---
      setPoints(prev => [...prev, intersect.point.clone()]);
      setTempPoint(null);
    };

    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("click", handleClick);

    const projectTo2D = (vec3) => {
      const vp = vec3.clone().project(camera);
      return {
        x: ((vp.x + 1) / 2) * overlayRef.current.width,
        y: ((1 - vp.y) / 2) * overlayRef.current.height,
      };
    };

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderer.render(scene, camera);

      const overlay = overlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext("2d");
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      const allPoints = pointsRef.current;
      const tempP = tempPointRef.current;
      const currentMode = modeRef.current;

      // --- رسم نقاط ---
      allPoints.forEach(p => {
        const sp = projectTo2D(p);
        ctx.fillStyle = "rgba(255,0,0,0.7)";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      if (tempP) {
        const sp = projectTo2D(tempP);
        ctx.fillStyle = "rgba(0,200,255,0.8)";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- طول ---
      if (currentMode === "point") {
        for (let i = 0; i + 1 < allPoints.length; i += 2) {
          const p0 = projectTo2D(allPoints[i]);
          const p1 = projectTo2D(allPoints[i + 1]);
          ctx.strokeStyle = "yellow"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
          const distFeet = (allPoints[i].distanceTo(allPoints[i + 1]) * 39.3701 / 12).toFixed(2);
          ctx.fillStyle = "white"; ctx.font = "16px sans-serif";
          ctx.fillText(`${distFeet} ft`, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2 - 5);
        }
        if (allPoints.length % 2 === 1 && tempP) {
          const p0 = projectTo2D(allPoints[allPoints.length - 1]);
          const p1 = projectTo2D(tempP);
          ctx.strokeStyle = "orange"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
      }

      // --- زاویه ---
      if (currentMode === "angle") {
        const pts = allPoints;
        if (pts.length >= 1) {
          const A = pts[0];
          const B = pts.length >= 2 ? pts[1] : tempP;
          if (B) {
            const p0 = projectTo2D(A);
            const p1 = projectTo2D(B);
            ctx.strokeStyle = pts.length >= 2 ? "yellow" : "orange";
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
        }
        if (pts.length >= 2) {
          const B = pts[1];
          const C = pts.length >= 3 ? pts[2] : tempP;
          if (C) {
            const p1 = projectTo2D(B);
            const p2 = projectTo2D(C);
            ctx.strokeStyle = pts.length >= 3 ? "yellow" : "orange";
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
        if (pts.length >= 3) {
          const A = pts[0];
          const B = pts[1];
          const C = pts[2];
          const pA = projectTo2D(A);
          const pB = projectTo2D(B);
          const pC = projectTo2D(C);
          const angle = calculateAngle(A, B, C).toFixed(2);

          const vBA = new THREE.Vector2(pA.x - pB.x, pA.y - pB.y).normalize();
          const vBC = new THREE.Vector2(pC.x - pB.x, pC.y - pB.y).normalize();

          let startAngle = Math.atan2(vBA.y, vBA.x);
          let endAngle = Math.atan2(vBC.y, vBC.x);
          let diff = endAngle - startAngle;
          if (diff < 0) diff += Math.PI * 2;
          if (diff > Math.PI) [startAngle, endAngle] = [endAngle, startAngle];

          ctx.strokeStyle = "cyan";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pB.x, pB.y, 40, startAngle, endAngle, false);
          ctx.stroke();

          const mid = (startAngle + endAngle) / 2;
          ctx.fillStyle = "white";
          ctx.font = "16px sans-serif";
          ctx.fillText(`${angle}°`, pB.x + 50 * Math.cos(mid), pB.y + 50 * Math.sin(mid));
        }
      }

      // --- مساحت ---
      if (currentMode === "face") {
        const polyPoints = selectedMeshRef.current ? [...pointsRef.current] : [];
        if (tempP && selectedMeshRef.current) polyPoints.push(tempP);
        if (polyPoints.length >= 2) {
          ctx.fillStyle = "rgba(0,200,255,0.3)";
          ctx.beginPath();
          polyPoints.forEach((p, idx) => {
            const sp = projectTo2D(p);
            if (idx === 0) ctx.moveTo(sp.x, sp.y);
            else ctx.lineTo(sp.x, sp.y);
          });
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "orange"; ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (polyPoints.length >= 3) {
          const areaFeet = (polygonArea3D(polyPoints) * 1550.0031 / 144).toFixed(2);
          const centroid = polyPoints.reduce((acc, p) => acc.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / polyPoints.length);
          const c = projectTo2D(centroid);
          ctx.fillStyle = "white";
          ctx.fillText(`${areaFeet} ft²`, c.x, c.y);
        }
      }
    };

    animate();

    const resize = () => {
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      overlayRef.current.width = canvas.clientWidth;
      overlayRef.current.height = canvas.clientHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("click", handleClick);
      window.removeEventListener("resize", resize);
    };
  }, []);

  let cursorStyle = "default";
  if (mode === "point") cursorStyle = "crosshair";
  else if (mode === "angle") cursorStyle = "alias";
  else if (mode === "face") cursorStyle = "pointer";

  return (
    <div className="w-screen h-screen relative bg-slate-50" style={{ cursor: cursorStyle }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      <canvas ref={overlayRef} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
      <div className="absolute top-4 right-4 flex gap-3 bg-white/90 p-2 rounded shadow">
        <button className={`w-12 h-12 ${mode === "point" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={() => { setPoints([]); selectedMeshRef.current = null; setMode("point") }} title="طول">📏</button>
        <button className={`w-12 h-12 ${mode === "face" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={() => { setPoints([]); selectedMeshRef.current = null; setMode("face") }} title="مساحت">🟩</button>
        <button className={`w-12 h-12 ${mode === "angle" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={() => { setPoints([]); setMode("angle") }} title="زاویه">📐</button>
        <button className="w-12 h-12 bg-gray-200" onClick={() => { setPoints([]); selectedMeshRef.current = null; }} title="پاک کردن">❌</button>
      </div>
    </div>
  );
}
