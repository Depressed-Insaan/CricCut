import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export default function ThreeBackground() {
  const mountRef = useRef(null);
  const rafRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const parallaxRef = useRef({ x: 0, y: 0 });

  const isReduced = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    if (!mountRef.current || isReduced) return;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0f0a, 0.06);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 0.2, 5.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0x22c55e, 1.8);
    key.position.set(3, 4, 2);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(-4, 1.5, -3);
    scene.add(rim);

    // --- Cricket bat model (basic geometries) ---
    const bat = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x9c7a52,
      roughness: 0.55,
      metalness: 0.05,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a22,
      roughness: 0.3,
      metalness: 0.08,
      emissive: 0x0c1a10,
      emissiveIntensity: 0.5,
    });

    // Blade: box with a slight taper
    const bladeGeom = new THREE.BoxGeometry(0.55, 2.4, 0.12);
    const blade = new THREE.Mesh(bladeGeom, woodMat);
    blade.position.set(0, -0.2, 0);
    blade.castShadow = false;
    blade.receiveShadow = false;
    bat.add(blade);

    // Handle: cylinder
    const handleGeom = new THREE.CylinderGeometry(0.09, 0.11, 1.2, 18);
    const handle = new THREE.Mesh(handleGeom, gripMat);
    handle.position.set(0, 1.25, 0);
    bat.add(handle);

    // Guard/shoulder: small box
    const shoulderGeom = new THREE.BoxGeometry(0.42, 0.18, 0.16);
    const shoulder = new THREE.Mesh(shoulderGeom, woodMat);
    shoulder.position.set(0, 0.85, 0);
    bat.add(shoulder);

    // Green edge glow
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x0b120d,
      roughness: 0.35,
      metalness: 0.15,
      emissive: 0x22c55e,
      emissiveIntensity: 0.75,
    });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.58, 2.45, 0.03), edgeMat);
    edge.position.set(0, -0.2, 0.08);
    bat.add(edge);

    bat.rotation.set(-0.22, 0.45, 0.08);
    bat.position.set(0.5, 0.05, 0);
    scene.add(bat);

    // --- Floating cricket balls (instanced spheres drifting) ---
    const ballCount = 34;
    const ballGeom = new THREE.SphereGeometry(0.07, 18, 18);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0x9b1c1c,
      roughness: 0.35,
      metalness: 0.05,
      emissive: 0x220606,
      emissiveIntensity: 0.5,
    });
    const balls = new THREE.InstancedMesh(ballGeom, ballMat, ballCount);
    balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(balls);

    const ballData = Array.from({ length: ballCount }).map(() => ({
      x: THREE.MathUtils.randFloatSpread(8),
      y: THREE.MathUtils.randFloatSpread(4),
      z: THREE.MathUtils.randFloat(-2, 4),
      vx: THREE.MathUtils.randFloat(0.02, 0.06),
      vy: THREE.MathUtils.randFloat(-0.01, 0.01),
      rot: THREE.MathUtils.randFloat(0, Math.PI * 2),
      rSpeed: THREE.MathUtils.randFloat(0.2, 0.7),
      scale: THREE.MathUtils.randFloat(0.75, 1.25),
    }));

    // --- Green particle field (THREE.Points) ---
    const fieldCount = 1200;
    const fieldGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(fieldCount * 3);
    const sizes = new Float32Array(fieldCount);
    for (let i = 0; i < fieldCount; i++) {
      positions[i * 3 + 0] = THREE.MathUtils.randFloatSpread(14);
      positions[i * 3 + 1] = THREE.MathUtils.randFloatSpread(8);
      positions[i * 3 + 2] = THREE.MathUtils.randFloat(-8, 6);
      sizes[i] = THREE.MathUtils.randFloat(0.2, 1.2);
    }
    fieldGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    fieldGeom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const fieldMat = new THREE.PointsMaterial({
      color: 0x22c55e,
      size: 0.02,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const field = new THREE.Points(fieldGeom, fieldMat);
    field.position.z = -1;
    scene.add(field);

    // Pointer parallax
    const onPointerMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      pointerRef.current.x = x;
      pointerRef.current.y = y;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', resize, { passive: true });

    const clock = new THREE.Clock();
    const tmp = new THREE.Object3D();

    const tick = () => {
      const t = clock.getElapsedTime();

      // Smooth parallax
      parallaxRef.current.x = THREE.MathUtils.lerp(
        parallaxRef.current.x,
        pointerRef.current.x,
        0.04
      );
      parallaxRef.current.y = THREE.MathUtils.lerp(
        parallaxRef.current.y,
        pointerRef.current.y,
        0.04
      );

      const px = parallaxRef.current.x;
      const py = parallaxRef.current.y;

      camera.position.x = px * 0.22;
      camera.position.y = 0.2 + -py * 0.12;
      camera.lookAt(0, 0, 0);

      bat.rotation.y = 0.55 + t * 0.18 + px * 0.12;
      bat.rotation.x = -0.22 + Math.sin(t * 0.35) * 0.04 + -py * 0.08;

      // Drift particle field
      field.rotation.y = t * 0.02 + px * 0.03;
      field.rotation.x = t * 0.015 + -py * 0.03;

      // Update balls
      for (let i = 0; i < ballCount; i++) {
        const b = ballData[i];
        b.x -= b.vx;
        b.y += b.vy + Math.sin(t * 0.8 + b.rot) * 0.0006;
        b.rot += b.rSpeed * 0.01;

        if (b.x < -6) {
          b.x = 6;
          b.y = THREE.MathUtils.randFloatSpread(4);
          b.z = THREE.MathUtils.randFloat(-2, 4);
        }

        tmp.position.set(b.x + px * 0.2, b.y + -py * 0.18, b.z);
        tmp.rotation.set(b.rot, b.rot * 0.6, b.rot * 0.25);
        tmp.scale.setScalar(b.scale);
        tmp.updateMatrix();
        balls.setMatrixAt(i, tmp.matrix);
      }
      balls.instanceMatrix.needsUpdate = true;

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', resize);

      renderer.dispose();
      mount.removeChild(renderer.domElement);

      bladeGeom.dispose();
      handleGeom.dispose();
      shoulderGeom.dispose();
      edge.geometry.dispose();
      ballGeom.dispose();
      fieldGeom.dispose();
      woodMat.dispose();
      gripMat.dispose();
      edgeMat.dispose();
      ballMat.dispose();
      fieldMat.dispose();
    };
  }, [isReduced]);

  return <div className="three-bg" ref={mountRef} aria-hidden />;
}

