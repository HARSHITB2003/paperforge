import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../../lib/util.js';

export default function AmbientTicker({ count = 80 }) {
  const ref = useRef();

  const { positions, colors, speeds } = useMemo(() => {
    const rand = mulberry32(11);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const palette = [
      [0, 0.82, 0.58],
      [1, 0.3, 0.37],
      [0.3, 0.56, 1],
      [0.215, 0.26, 0.32],
    ];
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (rand() - 0.5) * 16;
      positions[i3 + 1] = (rand() - 0.5) * 10;
      positions[i3 + 2] = (rand() - 0.5) * 8 - 2;
      const c = palette[Math.floor(rand() * palette.length)];
      colors[i3] = c[0];
      colors[i3 + 1] = c[1];
      colors[i3 + 2] = c[2];
      speeds[i] = 0.05 + rand() * 0.12;
    }
    return { positions, colors, speeds };
  }, [count]);

  useFrame((_state, delta) => {
    if (!ref.current) return;
    const arr = ref.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * delta;
      if (arr[i * 3 + 1] > 5) arr[i * 3 + 1] = -5;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} vertexColors transparent opacity={0.6} depthWrite={false} />
    </points>
  );
}
