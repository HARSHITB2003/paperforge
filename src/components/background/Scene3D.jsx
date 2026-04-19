import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import PriceRibbon from './PriceRibbon.jsx';
import AmbientTicker from './AmbientTicker.jsx';

export default function Scene3D() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <fog attach="fog" args={['#06080D', 8, 20]} />
        <ambientLight intensity={0.15} />
        <PriceRibbon
          count={isMobile ? 100 : 300}
          waveAmplitude={isMobile ? 0 : 0.3}
          rotationSpeed={0.0018}
          mobile={isMobile}
        />
        <AmbientTicker count={isMobile ? 30 : 80} />
        <gridHelper args={[60, 60, '#1E2433', '#1E2433']} position={[0, -4, 0]} />
      </Canvas>
      {/* subtle radial vignette so the hero text always stays readable */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 40%, rgba(6,8,13,0.55) 0%, rgba(6,8,13,0.82) 60%, rgba(6,8,13,0.95) 100%)',
        }}
      />
    </div>
  );
}
