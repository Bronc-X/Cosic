import { useEffect, useRef } from 'react';

interface SchoolDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  targetAlpha: number;
  size: number;
  phase: number;
  orbit: number;
}

const DOT_COUNT = 180;
const WAKE_RADIUS = 260;
const FLEE_RADIUS = 86;
const ORBIT_RADIUS = 172;
const MAX_SPEED = 1.72;
const BASE_DRIFT = 0.12;

const randomRange = (min: number, max: number) => min + Math.random() * (max - min);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const ease = (current: number, target: number, amount: number) => current + (target - current) * amount;

const createDot = (width: number, height: number, pointer?: { x: number; y: number }): SchoolDot => {
  const angle = Math.random() * Math.PI * 2;
  const distance = pointer ? randomRange(90, WAKE_RADIUS) : randomRange(0, Math.max(width, height));

  return {
    x: pointer ? pointer.x + Math.cos(angle) * distance : Math.random() * width,
    y: pointer ? pointer.y + Math.sin(angle) * distance * 0.62 : Math.random() * height,
    vx: Math.cos(angle + Math.PI / 2) * randomRange(0.2, 0.7),
    vy: Math.sin(angle + Math.PI / 2) * randomRange(0.2, 0.7),
    alpha: 0,
    targetAlpha: 0,
    size: randomRange(1.15, 2.7),
    phase: Math.random() * Math.PI * 2,
    orbit: Math.random() > 0.5 ? 1 : -1
  };
};

export function CursorParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let lastMoveAt = -Number.POSITIVE_INFINITY;
    let previousTime = performance.now();
    const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
    let dots: SchoolDot[] = [];

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (dots.length === 0) {
        dots = Array.from({ length: DOT_COUNT }, () => createDot(width, height));
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      if (!Number.isFinite(pointer.smoothX) || lastMoveAt < 0) {
        pointer.smoothX = pointer.x;
        pointer.smoothY = pointer.y;
      }

      lastMoveAt = performance.now();
    };

    const wrapDot = (dot: SchoolDot) => {
      const margin = 34;
      if (dot.x < -margin) {
        dot.x = width + margin;
      } else if (dot.x > width + margin) {
        dot.x = -margin;
      }

      if (dot.y < -margin) {
        dot.y = height + margin;
      } else if (dot.y > height + margin) {
        dot.y = -margin;
      }
    };

    const wakeDotNearPointer = (dot: SchoolDot) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = randomRange(FLEE_RADIUS + 26, WAKE_RADIUS);
      dot.x = pointer.smoothX + Math.cos(angle) * distance;
      dot.y = pointer.smoothY + Math.sin(angle) * distance * 0.58;
      dot.vx = Math.cos(angle + dot.orbit * Math.PI / 2) * randomRange(0.34, 0.8);
      dot.vy = Math.sin(angle + dot.orbit * Math.PI / 2) * randomRange(0.34, 0.8);
      dot.alpha = 0;
    };

    const updateDot = (dot: SchoolDot, time: number, delta: number, pointerActive: boolean) => {
      pointer.smoothX = ease(pointer.smoothX, pointer.x, 0.08);
      pointer.smoothY = ease(pointer.smoothY, pointer.y, 0.08);

      const dx = dot.x - pointer.smoothX;
      const dy = dot.y - pointer.smoothY;
      const distance = Math.hypot(dx, dy) || 1;
      const influence = pointerActive ? clamp(1 - distance / WAKE_RADIUS, 0, 1) : 0;
      const flee = pointerActive ? clamp(1 - distance / FLEE_RADIUS, 0, 1) : 0;
      const orbit = pointerActive ? clamp(1 - Math.abs(distance - ORBIT_RADIUS) / ORBIT_RADIUS, 0, 1) : 0;
      const nx = dx / distance;
      const ny = dy / distance;
      const tx = -ny * dot.orbit;
      const ty = nx * dot.orbit;
      const swim = Math.sin(time / 760 + dot.phase);

      dot.vx += tx * orbit * 0.035 + nx * flee * 0.13 + Math.cos(dot.phase + time / 1400) * BASE_DRIFT * delta;
      dot.vy += ty * orbit * 0.035 + ny * flee * 0.13 + Math.sin(dot.phase + time / 1300) * BASE_DRIFT * delta;

      if (pointerActive && distance > WAKE_RADIUS * 0.76 && Math.random() < 0.006 * delta) {
        wakeDotNearPointer(dot);
      }

      const speed = Math.hypot(dot.vx, dot.vy) || 1;
      if (speed > MAX_SPEED) {
        dot.vx = (dot.vx / speed) * MAX_SPEED;
        dot.vy = (dot.vy / speed) * MAX_SPEED;
      }

      dot.x += dot.vx * delta + swim * 0.08;
      dot.y += dot.vy * delta + Math.cos(time / 820 + dot.phase) * 0.08;
      dot.vx *= 0.984;
      dot.vy *= 0.984;
      dot.targetAlpha = pointerActive ? Math.pow(influence, 0.74) * 0.78 : 0;
      dot.alpha = ease(dot.alpha, dot.targetAlpha, pointerActive ? 0.045 : 0.026);

      if (!pointerActive) {
        wrapDot(dot);
      }
    };

    const drawDot = (dot: SchoolDot, time: number) => {
      if (dot.alpha < 0.01) {
        return;
      }

      const breath = 0.82 + Math.sin(time / 620 + dot.phase) * 0.18;
      context.fillStyle = `rgba(220, 255, 248, ${dot.alpha * breath})`;
      context.beginPath();
      context.arc(dot.x, dot.y, dot.size * breath, 0, Math.PI * 2);
      context.fill();
    };

    const render = (time: number) => {
      const delta = clamp((time - previousTime) / 16.67, 0.4, 2);
      previousTime = time;
      context.clearRect(0, 0, width, height);

      const pointerActive = time - lastMoveAt < 1300;

      for (const dot of dots) {
        updateDot(dot, time, delta, pointerActive);
        drawDot(dot, time);
      }

      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="cursor-particle-field" aria-hidden="true" />;
}
