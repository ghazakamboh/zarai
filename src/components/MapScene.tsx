import { motion, useSpring, useMotionValue } from 'motion/react';
import { useEffect } from 'react';

export default function MapScene() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth mouse tracking
  const springX = useSpring(mouseX, { damping: 50, stiffness: 400 });
  const springY = useSpring(mouseY, { damping: 50, stiffness: 400 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div className="fixed inset-0 z-0 bg-[#0a1a0f] overflow-hidden">
      {/* Interactive Light Follower */}
      <motion.div 
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.08] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle, #e9c46a 0%, transparent 70%)',
          left: 0,
          top: 0,
          x: springX,
          y: springY,
          translateX: '-50%',
          translateY: '-50%',
        }}
      />

      {/* Floating Particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            x: Math.random() * window.innerWidth, 
            y: Math.random() * window.innerHeight 
          }}
          animate={{
            y: [null, Math.random() * -100 - 50],
            opacity: [0, 0.4, 0],
          }}
          transition={{
            duration: Math.random() * 10 + 10,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute w-1 h-1 bg-[#2a9d8f] rounded-full pointer-events-none"
          style={{
            left: 0,
            top: 0,
            filter: 'blur(1px)'
          }}
        />
      ))}

      {/* Radial Gradient Background */}
      <div 
        className="absolute inset-0 z-0 opacity-100"
        style={{
          background: 'radial-gradient(ellipse at center, #1a1500 0%, #0a1a0f 70%)'
        }}
      />
      
      {/* Star-like dots using CSS */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Geometric Corner Decorations (SVG) */}
      <div className="absolute inset-0 z-0 pointer-events-none p-6 md:p-10">
        {/* Top-Left */}
        <div className="absolute top-6 left-6 md:top-10 md:left-10 w-24 h-24 opacity-12">
          <svg viewBox="0 0 100 100" className="w-full h-full stroke-[#e9c46a]" fill="none">
            <path d="M0 50 L0 0 L50 0 M20 40 L20 20 L40 20" strokeWidth="2" />
          </svg>
        </div>
        {/* Top-Right */}
        <div className="absolute top-6 right-6 md:top-10 md:right-10 w-24 h-24 opacity-12 rotate-90">
          <svg viewBox="0 0 100 100" className="w-full h-full stroke-[#e9c46a]" fill="none">
            <path d="M0 50 L0 0 L50 0 M20 40 L20 20 L40 20" strokeWidth="2" />
          </svg>
        </div>
        {/* Bottom-Left */}
        <div className="absolute bottom-6 left-6 md:bottom-10 md:left-10 w-24 h-24 opacity-12 -rotate-90">
          <svg viewBox="0 0 100 100" className="w-full h-full stroke-[#e9c46a]" fill="none">
            <path d="M0 50 L0 0 L50 0 M20 40 L20 20 L40 20" strokeWidth="2" />
          </svg>
        </div>
        {/* Bottom-Right */}
        <div className="absolute bottom-6 right-6 md:bottom-10 md:right-10 w-24 h-24 opacity-12 rotate-180">
          <svg viewBox="0 0 100 100" className="w-full h-full stroke-[#e9c46a]" fill="none">
            <path d="M0 50 L0 0 L50 0 M20 40 L20 20 L40 20" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

