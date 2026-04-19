import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../../lib/util.js';

function generateCandles(count, seed = 7) {
  const rand = mulberry32(seed);
  const candles = [];
  let price = 100;
  const drift = 0.0005;
  const vol = 0.012;
  for (let i = 0; i < count; i++) {
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const ret = drift + vol * z;
    const open = price;
    const close = price * (1 + ret);
    const body = Math.abs(close - open);
    const high = Math.max(open, close) + body * (0.3 + rand() * 0.8);
    const low = Math.min(open, close) - body * (0.3 + rand() * 0.8);
    candles.push({ open, close, high, low });
    price = close;
  }
  return candles;
}

export default function PriceRibbon({ count = 300, waveAmplitude = 0.3, rotationSpeed = 0.002, mobile = false }) {
  const greenRef = useRef();
  const redRef = useRef();
  const wickRef = useRef();
  const groupRef = useRef();

  const { greenCandles, redCandles, wicks } = useMemo(() => {
    const raw = generateCandles(count, 42);
    // Normalise prices to a vertical band [-0.8, 0.8]
    const prices = raw.flatMap((c) => [c.high, c.low]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const mid = (min + max) / 2;
    const range = max - min;
    const yScale = 1.4 / range;

    const span = 14; // length of ribbon in X
    const curveDepth = 4;
    const step = span / count;

    const greens = [];
    const reds = [];
    const wicksArr = [];

    for (let i = 0; i < count; i++) {
      const c = raw[i];
      const x = i * step - span / 2;
      const t = i / (count - 1);
      const z = -curveDepth * (t - 0.5) * (t - 0.5) * 4 + 1.5;
      const yOffset = ((c.open + c.close) / 2 - mid) * yScale;
      const bodyHeight = Math.max(0.015, Math.abs(c.close - c.open) * yScale);
      const wickHeight = Math.max(0.01, (c.high - c.low) * yScale);

      const isUp = c.close >= c.open;
      const entry = {
        x,
        y: yOffset,
        z,
        height: bodyHeight,
      };
      if (isUp) greens.push(entry);
      else reds.push(entry);

      wicksArr.push({ x, y: yOffset + (c.high + c.low) / 2 - (c.open + c.close) / 2, z, height: wickHeight });
    }
    return { greenCandles: greens, redCandles: reds, wicks: wicksArr };
  }, [count]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed;
      if (!mobile) {
        const t = state.clock.elapsedTime;
        groupRef.current.position.y = Math.sin(t * 0.3) * waveAmplitude * 0.5;
        groupRef.current.rotation.x = Math.sin(t * 0.2) * 0.08;
      }
    }
  });

  // Instanced meshes for perf
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const setInstances = (ref, items, width = 0.04) => {
    if (!ref.current) return;
    items.forEach((c, i) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.scale.set(width, c.height, width);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  };

  // Set once on mount using effect via ref callback below
  const greenRefCb = (node) => {
    greenRef.current = node;
    if (node) setInstances(greenRef, greenCandles, 0.05);
  };
  const redRefCb = (node) => {
    redRef.current = node;
    if (node) setInstances(redRef, redCandles, 0.05);
  };
  const wickRefCb = (node) => {
    wickRef.current = node;
    if (node) setInstances(wickRef, wicks, 0.006);
  };

  return (
    <group ref={groupRef} rotation={[0.1, 0, 0]}>
      <instancedMesh ref={greenRefCb} args={[null, null, greenCandles.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#00D395" transparent opacity={0.55} />
      </instancedMesh>
      <instancedMesh ref={redRefCb} args={[null, null, redCandles.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#FF4D5E" transparent opacity={0.55} />
      </instancedMesh>
      <instancedMesh ref={wickRefCb} args={[null, null, wicks.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#374252" transparent opacity={0.45} />
      </instancedMesh>
    </group>
  );
}
