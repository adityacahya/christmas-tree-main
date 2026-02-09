import { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
  shaderMaterial,
  Float,
  Stars,
  Sparkles,
  useTexture
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MathUtils } from 'three';
import * as random from 'maath/random';
import { GestureRecognizer, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

// --- 动态生成照片列表 (top.jpg + 1.jpg 到 31.jpg) ---
const TOTAL_NUMBERED_PHOTOS = 31;
// 修改：将 top.jpg 加入到数组开头
const bodyPhotoPaths = [
  '/photos/top.jpg',
  ...Array.from({ length: TOTAL_NUMBERED_PHOTOS }, (_, i) => `/photos/${i + 1}.jpg`)
];

// --- 视觉配置 ---
const CONFIG = {
  colors: {
    emerald: '#004225', // 纯正祖母绿
    gold: '#FFD700',
    silver: '#ECEFF1',
    red: '#D32F2F',
    green: '#2E7D32',
    white: '#FFFFFF',   // 纯白色
    warmLight: '#FFD54F',
    lights: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'], // 彩灯
    // 拍立得边框颜色池 (复古柔和色系)
    borders: ['#FFFAF0', '#F0E68C', '#E6E6FA', '#FFB6C1', '#98FB98', '#87CEFA', '#FFDAB9'],
    // 圣诞元素颜色
    giftColors: ['#D32F2F', '#FFD700', '#1976D2', '#2E7D32'],
    candyColors: ['#FF0000', '#FFFFFF']
  },
  counts: {
    foliage: 15000,
    ornaments: 300,   // 拍立得照片数量
    elements: 200,    // 圣诞元素数量
    lights: 400       // 彩灯数量
  },
  tree: { height: 22, radius: 9 }, // 树体尺寸
  photos: {
    // top 属性不再需要，因为已经移入 body
    body: bodyPhotoPaths
  }
};

// --- Shader Material (Foliage) ---
const FoliageMaterial = shaderMaterial(
  { 
    uTime: 0, 
    uColor: new THREE.Color(CONFIG.colors.emerald), 
    uProgress: 0,
    uPulse: 0
  }
,
  `uniform float uTime;
  uniform float uProgress;
  uniform float uPulse;

  attribute vec3 aTargetPos;
  attribute float aRandom;

  float cubicInOut(float t) {
    return t < 0.5
      ? 4.0 * t * t * t
      : 0.5 * pow(2.0 * t - 2.0, 3.0) + 1.0;
  }

  void main() {
    float t = cubicInOut(uProgress);

    // === NORMAL ARAH KELUAR (PENTING)
    vec3 normal = normalize(aTargetPos);

    // === DENYUT HIDUP (SMOOTH & ORGANIC)
    float pulse =
      sin(uTime * 1.4 + aRandom * 6.283) * 0.35 * uPulse;

    vec3 pulseOffset = normal * pulse;

    // === POSISI FINAL (TIDAK MERUSAK SHAPE)
    vec3 finalPos = mix(
      position,
      aTargetPos + pulseOffset,
      t
    );

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_PointSize = (55.0 * (1.0 + aRandom)) / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }`,
  `uniform vec3 uColor;

  void main() {
    float r = distance(gl_PointCoord, vec2(0.5));
    if (r > 0.5) discard;
    gl_FragColor = vec4(uColor, 1.0);
  }`
);
extend({ FoliageMaterial });

// --- Helper: Tree Shape ---
const getHeartPosition = () => {
  // Sample X,Y dengan rejection sampling
  let x = 0
  let y = 0

  while (true) {
    x = (Math.random() * 2 - 1) * 1.4
    y = (Math.random() * 2 - 1) * 1.6

    const a = x * x + y * y - 1
    if (a * a * a - x * x * y * y * y <= 0) break
  }

  // Normalisasi jarak dari pusat
  const d = Math.sqrt(x * x + y * y)

  // ❤️ VOLUME GEMUK (INI KUNCI)
  const maxThickness = 5
  const thickness = Math.sqrt(1 - d * 0.7) * maxThickness

  // Z simetris kiri-kanan
  const z = (Math.random() * 2 - 1) * thickness

  return new THREE.Vector3(
    x * 8,
    y * 8,
    z
  )
}




// --- Component: Foliage ---
const Foliage = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const materialRef = useRef<any>(null);
  const { positions, targetPositions, randoms } = useMemo(() => {
    const count = CONFIG.counts.foliage;
    const positions = new Float32Array(count * 3); const targetPositions = new Float32Array(count * 3); const randoms = new Float32Array(count);
    const spherePoints = random.inSphere(new Float32Array(count * 3), { radius: 25 }) as Float32Array;
    for (let i = 0; i < count; i++) {
      positions[i*3] = spherePoints[i*3]; positions[i*3+1] = spherePoints[i*3+1]; positions[i*3+2] = spherePoints[i*3+2];
      const [tx, ty, tz] = getHeartPosition();
      targetPositions[i*3] = tx; targetPositions[i*3+1] = ty; targetPositions[i*3+2] = tz;
      randoms[i] = Math.random();
    }
    return { positions, targetPositions, randoms };
  }, []);
  useFrame((rootState, delta) => {
    if (!materialRef.current) return;

    materialRef.current.uTime = rootState.clock.elapsedTime;

    const targetProgress = state === 'FORMED' ? 1 : 0;
    materialRef.current.uProgress = MathUtils.damp(
      materialRef.current.uProgress,
      targetProgress,
      1.5,
      delta
    );

    // ❤️ DENYUT MASUK PELAN SAAT FORMED
    materialRef.current.uPulse = MathUtils.damp(
      materialRef.current.uPulse ?? 0,
      state === 'FORMED' ? 1 : 0,
      2.0,
      delta
    );
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aTargetPos" args={[targetPositions, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <foliageMaterial ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
};

// --- Component: Photo Ornaments (Double-Sided Polaroid) ---
const PhotoOrnaments = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const textures = useTexture(CONFIG.photos.body);
  const count = CONFIG.counts.ornaments;
  const groupRef = useRef<THREE.Group>(null);

  const borderGeometry = useMemo(() => new THREE.PlaneGeometry(1.2, 1.5), []);
  const photoGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*70, (Math.random()-0.5)*70, (Math.random()-0.5)*70);
      const h = CONFIG.tree.height; const y = (Math.random() * h) - (h / 2);
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) + 0.5;
      const theta = Math.random() * Math.PI * 2;
      const [hx, hy, hz] = getHeartPosition();
      const targetPos = new THREE.Vector3(hx, hy, hz);


      const isBig = Math.random() < 0.2;
      const baseScale = isBig ? 2.2 : 0.8 + Math.random() * 0.6;
      const weight = 0.8 + Math.random() * 1.2;
      const borderColor = CONFIG.colors.borders[Math.floor(Math.random() * CONFIG.colors.borders.length)];

      const rotationSpeed = {
        x: (Math.random() - 0.5) * 1.0,
        y: (Math.random() - 0.5) * 1.0,
        z: (Math.random() - 0.5) * 1.0
      };
      const chaosRotation = new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);

      return {
        chaosPos, targetPos, scale: baseScale, weight,
        textureIndex: i % textures.length,
        borderColor,
        currentPos: chaosPos.clone(),
        chaosRotation,
        rotationSpeed,
        wobbleOffset: Math.random() * 10,
        wobbleSpeed: 0.5 + Math.random() * 0.5
      };
    });
  }, [textures, count]);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;

    groupRef.current.children.forEach((group, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;

      objData.currentPos.lerp(target, delta * (isFormed ? 0.8 * objData.weight : 0.5));
      group.position.copy(objData.currentPos);

      if (isFormed) {
         const targetLookPos = new THREE.Vector3(group.position.x * 2, group.position.y + 0.5, group.position.z * 2);
         group.lookAt(targetLookPos);

         const wobbleX = Math.sin(time * objData.wobbleSpeed + objData.wobbleOffset) * 0.05;
         const wobbleZ = Math.cos(time * objData.wobbleSpeed * 0.8 + objData.wobbleOffset) * 0.05;
         group.rotation.x += wobbleX;
         group.rotation.z += wobbleZ;

      } else {
         group.rotation.x += delta * objData.rotationSpeed.x;
         group.rotation.y += delta * objData.rotationSpeed.y;
         group.rotation.z += delta * objData.rotationSpeed.z;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => (
        <group key={i} scale={[obj.scale, obj.scale, obj.scale]} rotation={state === 'CHAOS' ? obj.chaosRotation : [0,0,0]}>
          {/* 正面 */}
          <group position={[0, 0, 0.015]}>
            {[-0.15, -0.075, 0, 0.075, 0.15].map((depth, j) => (
          <mesh
            key={j}
            geometry={photoGeometry}
            position={[0, 0, depth]}
          >
            <meshStandardMaterial
              map={textures[obj.textureIndex]}
              transparent
              opacity={j === 2 ? 1 : 0.35}
              roughness={0.5}
              metalness={0}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

            <mesh geometry={borderGeometry} position={[0, -0.15, -0.01]}>
              <meshStandardMaterial color={obj.borderColor} roughness={0.9} metalness={0} side={THREE.FrontSide} />
            </mesh>
          </group>
          {/* 背面 */}
          <group position={[0, 0, -0.015]} rotation={[0, Math.PI, 0]}>
            <mesh geometry={photoGeometry}>
              <meshStandardMaterial
                map={textures[obj.textureIndex]}
                roughness={0.5} metalness={0}
                emissive={CONFIG.colors.white} emissiveMap={textures[obj.textureIndex]} emissiveIntensity={1.0}
                side={THREE.FrontSide}
              />
            </mesh>
            <mesh geometry={borderGeometry} position={[0, -0.15, -0.01]}>
              <meshStandardMaterial color={obj.borderColor} roughness={0.9} metalness={0} side={THREE.FrontSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
};

// --- Component: Christmas Elements ---
const ChristmasElements = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.elements;
  const groupRef = useRef<THREE.Group>(null);

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.8, 0.8), []);
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 16, 16), []);
  const caneGeometry = useMemo(() => new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const h = CONFIG.tree.height;
      const y = (Math.random() * h) - (h / 2);
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) * 0.95;
      const theta = Math.random() * Math.PI * 2;

      const [hx, hy, hz] = getHeartPosition();
      const targetPos = new THREE.Vector3(hx, hy, hz);


      const type = Math.floor(Math.random() * 3);
      let color; let scale = 1;
      if (type === 0) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.8 + Math.random() * 0.4; }
      else if (type === 1) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.6 + Math.random() * 0.4; }
      else { color = Math.random() > 0.5 ? CONFIG.colors.red : CONFIG.colors.white; scale = 0.7 + Math.random() * 0.3; }

      const rotationSpeed = { x: (Math.random()-0.5)*2.0, y: (Math.random()-0.5)*2.0, z: (Math.random()-0.5)*2.0 };
      return { type, chaosPos, targetPos, color, scale, currentPos: chaosPos.clone(), chaosRotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI), rotationSpeed };
    });
  }, [boxGeometry, sphereGeometry, caneGeometry]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 1.5);
      mesh.position.copy(objData.currentPos);
      mesh.rotation.x += delta * objData.rotationSpeed.x; mesh.rotation.y += delta * objData.rotationSpeed.y; mesh.rotation.z += delta * objData.rotationSpeed.z;
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => {
        let geometry; if (obj.type === 0) geometry = boxGeometry; else if (obj.type === 1) geometry = sphereGeometry; else geometry = caneGeometry;
        return ( <mesh key={i} scale={[obj.scale, obj.scale, obj.scale]} geometry={geometry} rotation={obj.chaosRotation}>
          <meshStandardMaterial color={obj.color} roughness={0.3} metalness={0.4} emissive={obj.color} emissiveIntensity={0.2} />
        </mesh> )})}
    </group>
  );
};

// --- Component: Fairy Lights ---
const FairyLights = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.lights;
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.8, 8, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const h = CONFIG.tree.height; const y = (Math.random() * h) - (h / 2); const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) + 0.3; const theta = Math.random() * Math.PI * 2;
      const [hx, hy, hz] = getHeartPosition();
      const targetPos = new THREE.Vector3(hx, hy, hz);

      const color = CONFIG.colors.lights[Math.floor(Math.random() * CONFIG.colors.lights.length)];
      const speed = 2 + Math.random() * 3;
      return { chaosPos, targetPos, color, speed, currentPos: chaosPos.clone(), timeOffset: Math.random() * 100 };
    });
  }, []);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 2.0);
      const mesh = child as THREE.Mesh;
      mesh.position.copy(objData.currentPos);
      const intensity = (Math.sin(time * objData.speed + objData.timeOffset) + 1) / 2;
      if (mesh.material) { (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = isFormed ? 3 + intensity * 4 : 0; }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => ( <mesh key={i} scale={[0.15, 0.15, 0.15]} geometry={geometry}>
          <meshStandardMaterial color={obj.color} emissive={obj.color} emissiveIntensity={0} toneMapped={false} />
        </mesh> ))}
    </group>
  );
};

// --- Component: Top Star (No Photo, Pure Gold 3D Star) ---
const TopStar = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);

  const starShape = useMemo(() => {
    const shape = new THREE.Shape();
    const outerRadius = 1.3; const innerRadius = 0.7; const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      i === 0 ? shape.moveTo(radius*Math.cos(angle), radius*Math.sin(angle)) : shape.lineTo(radius*Math.cos(angle), radius*Math.sin(angle));
    }
    shape.closePath();
    return shape;
  }, []);

  const starGeometry = useMemo(() => {
    return new THREE.ExtrudeGeometry(starShape, {
      depth: 0.4, // 增加一点厚度
      bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3,
    });
  }, [starShape]);

  // 纯金材质
  const goldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: CONFIG.colors.gold,
    emissive: CONFIG.colors.gold,
    emissiveIntensity: 1.5, // 适中亮度，既发光又有质感
    roughness: 0.1,
    metalness: 1.0,
  }), []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
      const targetScale = state === 'FORMED' ? 1 : 0;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 3);
    }
  });

  return (
    <group ref={groupRef} position={[0, CONFIG.tree.height / 2 + 1.8, 0]}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        <mesh geometry={starGeometry} material={goldMaterial} />
      </Float>
    </group>
  );
};

// --- Main Scene Experience ---
const Experience = ({
  sceneState,
  rotationSpeed,
  gestureData
}: {
  sceneState: 'CHAOS' | 'FORMED';
  rotationSpeed: number;
  gestureData: { x: number; y: number; zoom: number };
}) => {

  const velocityRef = useRef({ x: 0, y: 0 });
  const treeRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const zoomVelocityRef = useRef(0);
  useFrame((_, delta) => {
  if (!treeRef.current) return;

  // =========================
  // 1️⃣ ROTASI (gesture x/y)
  // =========================
  const SPRING = 8;
  const DAMPING = 6;

  const targetRotY = gestureData.x * 0.12;
  const targetRotX = gestureData.y * 0.08;

  velocityRef.current.x +=
    (targetRotY - treeRef.current.rotation.y) * SPRING * delta;
  velocityRef.current.y +=
    (targetRotX - treeRef.current.rotation.x) * SPRING * delta;

  velocityRef.current.x *= Math.exp(-DAMPING * delta);
  velocityRef.current.y *= Math.exp(-DAMPING * delta);

  treeRef.current.rotation.y += velocityRef.current.x * delta;
  treeRef.current.rotation.x += velocityRef.current.y * delta;

  // =========================
  // 2️⃣ PINCH ZOOM (DI SINI)
  // =========================
  const targetScale = gestureData.zoom;

  zoomVelocityRef.current +=
    (targetScale - treeRef.current.scale.x) * 8 * delta;

  zoomVelocityRef.current *= Math.exp(-6 * delta);

  const scaleRaw =
    treeRef.current.scale.x + zoomVelocityRef.current * delta;

  const scale = MathUtils.clamp(scaleRaw, 0.6, 2.5);
  treeRef.current.scale.setScalar(scale);

  // =========================
  // 3️⃣ POSISI (gesture x/y)
  // =========================
  treeRef.current.position.x = MathUtils.damp(
    treeRef.current.position.x,
    gestureData.x,
    4,
    delta
  );

  treeRef.current.position.y = MathUtils.damp(
    treeRef.current.position.y,
    -6 + gestureData.y,
    4,
    delta
  );
});




  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 8, 60]} fov={45} />
      <OrbitControls ref={controlsRef} enablePan={false} enableZoom={true} minDistance={30} maxDistance={120} autoRotate={rotationSpeed === 0 && sceneState === 'FORMED'} autoRotateSpeed={0.3} maxPolarAngle={Math.PI / 1.7} />

      <color attach="background" args={['#000300']} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Environment preset="night" background={false} />

      <ambientLight intensity={0.4} color="#003311" />
      <pointLight
        position={[15, 5, 20]}
        intensity={2}
        color="#FFD700"
      />

      <pointLight
        position={[-15, -5, -20]}
        intensity={1.5}
        color="#ffffff"
      />

      <pointLight position={[30, 30, 30]} intensity={100} color={CONFIG.colors.warmLight} />
      <pointLight position={[-30, 10, -30]} intensity={50} color={CONFIG.colors.gold} />
      <pointLight position={[0, -20, 10]} intensity={30} color="#ffffff" />

      <group ref={treeRef} position={[0, -6, 0]}>
        <Foliage state={sceneState} />
        <Suspense fallback={null}>
           <PhotoOrnaments state={sceneState} />
           <ChristmasElements state={sceneState} />
           <FairyLights state={sceneState} />
           <TopStar state={sceneState} />
        </Suspense>
        <Sparkles count={600} scale={50} size={8} speed={0.4} opacity={0.4} color={CONFIG.colors.silver} />
      </group>

      <EffectComposer>
        <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.1} intensity={1.5} radius={0.5} mipmapBlur />
        <Vignette eskil={false} offset={0.1} darkness={1.2} />
      </EffectComposer>
    </>
  );
};

// --- Gesture Controller ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GestureController = ({ onGesture, onMove, onStatus, debugMode }: any) => {
  const smoothPosRef = useRef({ x: 0, y: 0 });
  const gestureHoldRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const initializedRef = useRef(false);
  const lastGestureRef = useRef<string | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let gestureRecognizer: GestureRecognizer | null = null;
    let requestRef: number;

    const predictWebcam = () => {
      if (!gestureRecognizer || !videoRef.current) {
        requestRef = requestAnimationFrame(predictWebcam);
        return;
      }

      const results = gestureRecognizer.recognizeForVideo(
        videoRef.current,
        performance.now()
      );

      // === GESTURE (OPEN / CLOSE HAND) ===
      if (results.gestures?.length > 0) {
  const gesture = results.gestures[0][0];

  if (gesture.score > 0.7) {
    if (gesture.categoryName === "Closed_Fist" && !gestureHoldRef.current) {
      gestureHoldRef.current = true;
      onGesture("FORMED");
    }

    if (gesture.categoryName === "Open_Palm" && gestureHoldRef.current) {
      gestureHoldRef.current = false;
      onGesture("CHAOS");
    }
  }
}


      // === HAND POSITION (MOVE / ROTATE) ===
      if (results.landmarks?.length > 0) {
        const hand = results.landmarks[0][0];
        const landmarks = results.landmarks[0];

        // === PINCH DETECTION ===
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const pinchDistance = Math.sqrt(dx * dx + dy * dy);

        // Init pertama (PENTING)
        if (pinchDistanceRef.current === null) {
          pinchDistanceRef.current = pinchDistance;
          requestRef = requestAnimationFrame(predictWebcam);
          return;
        } 

        // Hitung delta
        const pinchDelta = pinchDistanceRef.current - pinchDistance;
        pinchDistanceRef.current = pinchDistance;

        // Update zoom (FUNCTIONAL UPDATE)
        onMove((prev: any) => ({
          ...prev,
          zoom: MathUtils.clamp(
            prev.zoom + pinchDelta * 2.5,
            0.6,
            2.5
          )
        }));

        
        const x = (hand.x - 0.5) * 20;
        const y = (0.5 - hand.y) * 15;

        // === SMOOTHING (ANTI JITTER) ===
        const SMOOTHING = 0.15;

        smoothPosRef.current.x += (x - smoothPosRef.current.x) * SMOOTHING;
        smoothPosRef.current.y += (y - smoothPosRef.current.y) * SMOOTHING;

        onMove((prev: any) => ({
          ...prev,
          x: smoothPosRef.current.x,
          y: smoothPosRef.current.y
        }));


      } else {
        pinchDistanceRef.current = null;
      }

      requestRef = requestAnimationFrame(predictWebcam);
    };

    const setup = async () => {
      onStatus("DOWNLOADING AI...");

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );

      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });

      onStatus("REQUESTING CAMERA...");

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      onStatus("AI READY: SHOW HAND");
      predictWebcam();
    };

    setup();

    return () => {
      cancelAnimationFrame(requestRef);

      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [onGesture, onMove, onStatus]);

  return (
    <>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: debugMode ? "320px" : "1px",
          opacity: debugMode ? 0.6 : 0,
          zIndex: debugMode ? 100 : -1,
          transform: "scaleX(-1)",
          pointerEvents: "none",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: debugMode ? "320px" : "1px",
          zIndex: debugMode ? 101 : -1,
          transform: "scaleX(-1)",
          pointerEvents: "none",
        }}
      />
    </>
  );
};


// --- App Entry ---
export default function GrandTreeApp() {
  const [sceneState, setSceneState] = useState<'CHAOS' | 'FORMED'>('CHAOS');
  const [rotationSpeed, setRotationSpeed] = useState(0);
  const [aiStatus, setAiStatus] = useState("INITIALIZING...");
  const [debugMode, setDebugMode] = useState(false);
  const [gestureData, setGestureData] = useState({
    x: 0,
    y: 0,
    zoom: 1
  });



  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
        <Canvas dpr={[1, 2]} gl={{ toneMapping: THREE.ReinhardToneMapping }} shadows>
            <Experience
              sceneState={sceneState}
              rotationSpeed={rotationSpeed}
              gestureData={gestureData}
            />


        </Canvas>
      </div>
      <GestureController
        onGesture={setSceneState}
        onMove={setGestureData}
        onStatus={setAiStatus}
        debugMode={debugMode}
      />



      {/* UI - Stats */}
      <div style={{ position: 'absolute', bottom: '30px', left: '40px', color: '#888', zIndex: 10, fontFamily: 'sans-serif', userSelect: 'none' }}>
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Memories</p>
          <p style={{ fontSize: '24px', color: '#FFD700', fontWeight: 'bold', margin: 0 }}>
            {CONFIG.counts.ornaments.toLocaleString()} <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>POLAROIDS</span>
          </p>
        </div>
        <div>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Foliage</p>
          <p style={{ fontSize: '24px', color: '#004225', fontWeight: 'bold', margin: 0 }}>
            {(CONFIG.counts.foliage / 1000).toFixed(0)}K <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>EMERALD NEEDLES</span>
          </p>
        </div>
      </div>

      {/* UI - Buttons */}
      <div style={{ position: 'absolute', bottom: '30px', right: '40px', zIndex: 10, display: 'flex', gap: '10px' }}>
        <button onClick={() => setDebugMode(!debugMode)} style={{ padding: '12px 15px', backgroundColor: debugMode ? '#FFD700' : 'rgba(0,0,0,0.5)', border: '1px solid #FFD700', color: debugMode ? '#000' : '#FFD700', fontFamily: 'sans-serif', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
           {debugMode ? 'HIDE DEBUG' : '🛠 DEBUG'}
        </button>
        <button onClick={() => setSceneState(s => s === 'CHAOS' ? 'FORMED' : 'CHAOS')} style={{ padding: '12px 30px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255, 215, 0, 0.5)', color: '#FFD700', fontFamily: 'serif', fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px', textTransform: 'uppercase', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
           {sceneState === 'CHAOS' ? 'Assemble Tree' : 'Disperse'}
        </button>
      </div>

      {/* UI - AI Status */}
      <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', color: aiStatus.includes('ERROR') ? '#FF0000' : 'rgba(255, 215, 0, 0.4)', fontSize: '10px', letterSpacing: '2px', zIndex: 10, background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px' }}>
        {aiStatus}
      </div>
    </div>
  );
}