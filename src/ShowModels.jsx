import React, { useState, useCallback, useRef } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";





// محاسبه مساحت چندضلعی
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

// محاسبه زاویه بین سه نقطه A-B-C
function calculateAngle(A, B, C) {
  const BA = new THREE.Vector3().subVectors(A, B);
  const BC = new THREE.Vector3().subVectors(C, B);
  const cosTheta = BA.dot(BC) / (BA.length() * BC.length());
  const angleRad = Math.acos(Math.min(Math.max(cosTheta, -1), 1));
  return (angleRad * 180) / Math.PI;
}

function InteractionController({ objects, points, setPoints, mode, setTempPoint }) {
  const { camera, gl } = useThree();
  const raycaster = new THREE.Raycaster();

  const handleMove = useCallback(
    (event) => {
      if (!objects || objects.length === 0) return;
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x, y }, camera);
      const intersects = raycaster.intersectObjects(objects, true);
      if (!intersects.length) return;
      const point = intersects[0].point.clone();

      if (
        (mode === "point" && points.length >= 1) ||
        (mode === "angle" && points.length < 3) ||
        (mode === "face" && points.length >= 1)
      ) {
        setTempPoint(point);
      } else {
        setTempPoint(null);
      }
    },
    [camera, gl, objects, mode, points, setTempPoint]
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

      // ⚡ شرط جدید: در حالت Length، اگر دو نقطه وجود داشته باشه دیگه اضافه نکن
      // if (mode === "point" && points.length >= 2) return;

      if (mode === "angle" && points.length >= 3) return;

      const point = intersects[0].point.clone();


      if (mode === "point") {
        if (points.length >= 2) {
          // وقتی کاربر بعد از دو نقطه کلیک کرد، طول قبلی پاک و نقطه جدید شروع طول جدید
          setPoints([point]); // نقطه سوم، به عنوان اولین نقطه طول جدید
        } else {
          setPoints((prev) => [...prev, point]); // اضافه کردن نقطه اول یا دوم
        }
        return; // دیگه ادامه نده
      }



      if (mode === "face" || mode === "angle" || mode === "point") {
        setPoints((prev) => [...prev, point]);
      }

      setTempPoint(null);
    },
    [camera, gl, objects, mode, points, setPoints, setTempPoint]
  );


  React.useEffect(() => {
    gl.domElement.addEventListener("mousemove", handleMove);
    gl.domElement.addEventListener("click", handleClick);
    return () => {
      gl.domElement.removeEventListener("mousemove", handleMove);
      gl.domElement.removeEventListener("click", handleClick);
    };
  }, [handleMove, handleClick, gl]);

  return null;
}

function ShowModels() {

  const [points, setPoints] = useState([]);
  const [tempPoint, setTempPoint] = useState(null);
  const [mode, setMode] = useState("point");
  const modelGroup = useRef();
  const cubeRef = useRef();

  let cursorStyle = "default";
  if (mode === "point") cursorStyle = "crosshair"; // ابزار طول
  else if (mode === "angle") cursorStyle = "alias"; // ابزار زاویه
  else if (mode === "face") cursorStyle = "pointer"; // ابزار مساحت

  const draco = new DRACOLoader();
  draco.setDecoderPath("./draco/");
  const model = useLoader(GLTFLoader, `./models/t.glb`, (loader) => {
    loader.setDRACOLoader(draco);
  });

  // طول
  const distanceMeters =
    points.length === 2 ? points[0].distanceTo(points[1]) : null;
  const distanceInFeet = distanceMeters
    ? ((distanceMeters * 39.3701) / 12).toFixed(2)
    : null;
  const tempDistance =
    mode === "point" && points.length >= 1 && tempPoint
      ? ((points[points.length - 1].distanceTo(tempPoint) * 39.3701) / 12).toFixed(2)
      : null;

  // زاویه
  // const angleDeg =
  mode === "angle" && points.length === 3
    ? calculateAngle(points[0], points[1], points[2]).toFixed(2)
    : null;
  const tempAngle =
    mode === "angle" && points.length >= 1 && points.length < 3 && tempPoint
      ? calculateAngle(
        points.length === 1 ? points[0] : points[1],
        points.length === 1 ? points[0] : points[1],
        tempPoint
      ).toFixed(2)
      : null;

  // مساحت
  const polygonAreaMeters =
    mode === "face" && points.length >= 3 ? polygonArea3D(points) : null;
  const polygonAreaInFeet = polygonAreaMeters
    ? ((polygonAreaMeters * 1550.0031) / 144).toFixed(2)
    : null;
  const tempPolygonAreaInFeet =
    mode === "face" && points.length >= 1 && tempPoint
      ? ((polygonArea3D([...points, tempPoint]) * 1550.0031) / 144).toFixed(2)
      : null;

  // آرایه اشیاء برای InteractionController
  const objects = [];
  if (modelGroup.current) objects.push(modelGroup.current);
  if (cubeRef.current) objects.push(cubeRef.current);

  return (
    <div className="w-screen h-screen relative bg-slate-50" style={{ cursor: cursorStyle }}>
      <Canvas shadows camera={{ position: [5, 5, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <OrbitControls />

        {/* مدل GLTF */}
        <group ref={modelGroup} scale={[1, 1, 1]} position={[0, 0, 0]}>
          <primitive object={model.scene} />
        </group>

        {/* مکعب کنار مدل */}
        <mesh ref={cubeRef} position={[3, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="lightblue" />
        </mesh>

        {/* نقاط انتخاب‌شده */}
        {points.map((point, index) => (
          <Html
            key={index}
            position={point}
            center
            style={{
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              style={{
                width: "30px",
                height: "30px",
                background: "rgba(0, 200, 255, 0.8)",
                borderRadius: "50%",
                border: "2px solid white",
                boxShadow: "0 0 10px rgba(0, 200, 255, 0.7)",
              }}
            />
          </Html>
        ))}

        {/* طول */}
        {mode === "point" && points.length >= 1 && points.length < 2 && tempPoint && (
          <>
            <Line points={[points[0], tempPoint]} color="orange" lineWidth={2} />
            <Html position={points[0].clone().add(tempPoint).multiplyScalar(0.5)}>
              <div className="bg-black text-white px-2 py-1 rounded text-xs border border-gray-700">
                {tempDistance} ft
              </div>
            </Html>
          </>
        )}

        {mode === "point" && points.length === 2 && (
          <>
            <Line points={[points[0], points[1]]} color="yellow" lineWidth={4} />
            <Html position={points[0].clone().add(points[1]).multiplyScalar(0.5)}>
              <div className="bg-black text-white px-2 py-1 rounded text-xs border border-gray-700">
                {distanceInFeet} ft
              </div>
            </Html>
          </>
        )}


        {/* زاویه */}
        {mode === "angle" && points.length >= 1 && tempPoint && points.length < 3 && (
          <Line
            points={[points.length === 1 ? points[0] : points[1], tempPoint]}
            color="orange"
            lineWidth={2}
          />
        )}
        {mode === "angle" && points.length === 2 && (
          <>
            <Line points={[points[0], points[1]]} color="yellow" lineWidth={4} />
            <Line points={[points[1], points[2] || tempPoint]} color="yellow" lineWidth={4} />
            <Html position={points[1]}>
              <div className="bg-black text-white px-2 py-1 rounded text-xs border border-gray-700">
                {tempAngle}°
              </div>
            </Html>
          </>
        )}
        {mode === "angle" && points.length === 3 && (() => {
          const A = points[0];
          const B = points[1]; // رأس زاویه
          const C = points[2];

          const BA = new THREE.Vector3().subVectors(A, B).normalize();
          const BC = new THREE.Vector3().subVectors(C, B).normalize();
          const angle = BA.angleTo(BC);
          const axis = new THREE.Vector3().crossVectors(BA, BC).normalize();
          const radius = 0.10;
          const segments = 32;

          const arcVertices = [B.clone()];
          for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * angle;
            const quat = new THREE.Quaternion().setFromAxisAngle(axis, t);
            const p = BA.clone().applyQuaternion(quat).multiplyScalar(radius).add(B);
            arcVertices.push(p);
          }

          const arcGeom = new THREE.BufferGeometry().setFromPoints(arcVertices);
          const indices = [];
          for (let i = 1; i < arcVertices.length - 1; i++) {
            indices.push(0, i, i + 1);
          }
          arcGeom.setIndex(indices);
          arcGeom.computeVertexNormals();

          return (
            <>
              {/* خطوط زاویه */}
              <Line points={[A, B]} color="yellow" lineWidth={3} />
              <Line points={[B, C]} color="yellow" lineWidth={3} />

              {/* کمان زاویه */}
              <mesh geometry={arcGeom}>
                <meshBasicMaterial
                  color="orange"
                  opacity={0.35}
                  transparent
                  side={THREE.DoubleSide}
                />
              </mesh>

              {/* نمایش درجه زاویه */}
              <Html position={B}>
                <div className="bg-black text-white px-2 py-1 rounded text-xs border border-gray-700">
                  {(angle * 180 / Math.PI).toFixed(2)}°
                </div>
              </Html>
            </>
          );
        })()}



        {/* مساحت */}
        {mode === "face" && points.length >= 1 && tempPoint && (
          <>
            {[...points, tempPoint].map((pt, idx, arr) => {
              if (idx === arr.length - 1) return null;
              return <Line key={idx} points={[arr[idx], arr[idx + 1]]} color="orange" lineWidth={2} />;
            })}
            <Html position={[...points, tempPoint].reduce((acc, p) => acc.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / ([...points, tempPoint].length))}>
              <div className="bg-black text-white px-2 py-1 rounded text-xs border border-gray-700">
                {tempPolygonAreaInFeet} ft²
              </div>
            </Html>
          </>
        )}
        {mode === "face" && points.length >= 3 && (
          <>
            {points.map((pt, idx) => {
              const next = points[(idx + 1) % points.length];
              return <Line key={idx} points={[pt, next]} color="green" lineWidth={4} />;
            })}
            <mesh position={[0, 0.01, 0]}>   {/* ← کمی بالاتر از سطح مدل */}
              <primitive object={new ConvexGeometry(points)} />
              <meshBasicMaterial color="green" opacity={0.3} transparent />
            </mesh>
            <Html position={points.reduce((acc, p) => acc.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / points.length)}>
              <div className="bg-black text-white px-2 py-1 rounded text-xs border border-gray-700">
                {polygonAreaInFeet} ft²
              </div>
            </Html>
          </>
        )}

        <InteractionController objects={objects} points={points} setPoints={setPoints} mode={mode} setTempPoint={setTempPoint} />
      </Canvas>

      {/* UI بالای صفحه سمت راست */}
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