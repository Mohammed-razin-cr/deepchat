import { useMemo } from 'react';

/**
 * Deep cosmic planet-horizon & starfield backdrop matching the reference login UI.
 */
export function AuroraBackground({ children }: { children: React.ReactNode }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 56 }, (_, i) => ({
        id: i,
        left: `${((i * 37 + 11) % 96) + 2}%`,
        top: `${((i * 53 + 5) % 60) + 3}%`,
        size: i % 7 === 0 ? 2.2 : i % 3 === 0 ? 1.5 : 1.1,
        opacity: 0.18 + ((i * 19) % 58) / 100,
      })),
    []
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#020510] text-slate-100 flex flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Deep upper cosmos gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 85% 55% at 50% 0%, rgba(23, 52, 118, 0.28) 0%, rgba(4, 9, 24, 0.2) 55%, #020510 100%)',
          }}
        />

        {/* Crisp Starfield */}
        {stars.map((s) => (
          <span
            key={s.id}
            className="absolute rounded-full bg-blue-100"
            style={{
              left: s.left,
              top: s.top,
              width: `${s.size}px`,
              height: `${s.size}px`,
              opacity: s.opacity,
            }}
          />
        ))}

        {/* Luminous Horizon Aura right behind center card seam */}
        <div
          className="absolute left-1/2 top-[53%] -translate-x-1/2 -translate-y-1/2 w-[820px] h-[380px] rounded-full blur-[120px]"
          style={{
            background:
              'radial-gradient(circle, rgba(59, 130, 246, 0.34) 0%, rgba(37, 99, 235, 0.14) 55%, transparent 100%)',
          }}
        />

        {/* Curved Cosmic Planet Horizon Arc */}
        <div
          className="absolute left-1/2 top-[56%] -translate-x-1/2 w-[2050px] h-[2050px] rounded-full"
          style={{
            background:
              'radial-gradient(circle at 50% 4%, rgba(6, 17, 46, 0.96) 0%, rgba(3, 8, 22, 0.99) 18%, #020510 38%)',
            boxShadow:
              '0 -3px 32px rgba(125, 185, 255, 0.55), 0 -18px 120px rgba(59, 130, 246, 0.42), inset 0 6px 36px rgba(147, 197, 253, 0.65)',
            borderTop: '2px solid rgba(191, 219, 254, 0.78)',
          }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">{children}</div>
    </div>
  );
}
