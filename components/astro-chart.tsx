"use client"

import { useMemo } from "react"

// Glifos zodiacales
const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"]

const PLANET_GLYPH_SVGS: Record<string, string> = {
  sun: "/planet-glyphs/sun.svg",
  moon: "/planet-glyphs/moon.svg",
  mercury: "/planet-glyphs/mercury.svg",
  venus: "/planet-glyphs/venus.svg",
  mars: "/planet-glyphs/mars.svg",
  jupiter: "/planet-glyphs/jupiter.svg",
  saturn: "/planet-glyphs/saturn.svg",
  uranus: "/planet-glyphs/uranus.svg",
  neptune: "/planet-glyphs/neptune.svg",
  pluto: "/planet-glyphs/pluto.svg",
}

interface Planet {
  name: string
  ChartPosition: {
    Ecliptic: {
      DecimalDegrees: number
    }
  }
  Sign: {
    label: string
  }
  House: number
}

interface AngularPoint {
  ChartPosition: {
    Ecliptic: {
      DecimalDegrees: number
    }
  }
}

interface AstroChartProps {
  planets: Planet[]
  ascendant: AngularPoint
  mc: AngularPoint
  size?: number
  aspects?: Array<{
    point1: { name: string; label: string }
    point2: { name: string; label: string }
    aspectType: string
    angle: number
    orb: number
  }>
}

// Normalizar ángulo a [0, 360)
function norm360(x: number): number {
  return ((x % 360) + 360) % 360
}

// Convertir coordenadas polares a cartesianas
function polarToCartesian(cx: number, cy: number, r: number, thetaDeg: number) {
  const thetaRad = (thetaDeg * Math.PI) / 180
  return {
    x: cx + r * Math.cos(thetaRad),
    y: cy - r * Math.sin(thetaRad), // Y invertido para SVG
  }
}

const ASPECT_STYLES: Record<string, { color: string; width: number; filter: string }> = {
  Oposición: { color: "#FFA500", width: 2, filter: "drop-shadow(0 0 4px #FFA500)" },
  Conjunción: { color: "#3399FF", width: 1, filter: "drop-shadow(0 0 4px #3399FF)" }, // Changed to bright blue, 90% opacity implicit, width to 1px
  Trígono: { color: "#00FF00", width: 1.5, filter: "drop-shadow(0 0 4px #00FF00)" },
  Cuadrado: { color: "#FF0000", width: 1.5, filter: "drop-shadow(0 0 4px #FF0000)" },
  Sextil: { color: "#0099FF", width: 1.5, filter: "drop-shadow(0 0 4px #0099FF)" },
}
const MAX_ASPECT_LINE_OPACITY = 0.7

function getGlyphGlowTiming(glyphName: string) {
  let hash = 0
  for (let i = 0; i < glyphName.length; i += 1) {
    hash = (hash * 31 + glyphName.charCodeAt(i)) % 100000
  }
  const durationSec = 5 + (hash % 5000) / 1000
  const delaySec = -((Math.floor(hash / 7) % 10000) / 1000)
  return {
    durationSec: durationSec.toFixed(3),
    delaySec: delaySec.toFixed(3),
  }
}

export function AstroChart({ planets, ascendant, mc, size = 400, aspects = [] }: AstroChartProps) {
  const cx = size / 2
  const cy = size / 2

  const ascDegrees = ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0
  const mcDegrees = mc?.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0

  // Radios para diferentes elementos
  const rOuter = size * 0.45
  const rSignsOuter = size * 0.45
  const rSignsInner = size * 0.35
  const rSignsMiddle = (rSignsOuter + rSignsInner) / 2
  const rHousesOuter = size * 0.35
  const rHousesInner = size * 0.08
  const rPlanets = size * 0.27

  // Rotación del chart: ASC siempre a la izquierda (180° canvas)
  const chartRotation = 180 - ascDegrees

  // Función canónica de conversión angular
  const toCanvasAngle = (lambda: number) => norm360(lambda + chartRotation)

  // Calcular cúspides de casas (Equal House system)
  const houseCusps = useMemo(() => {
    const cusps: number[] = []
    for (let n = 1; n <= 12; n++) {
      cusps.push(norm360(ascDegrees + (n - 1) * 30))
    }
    return cusps
  }, [ascDegrees])

  const planetPositions = useMemo(() => {
    if (!planets || planets.length === 0) return []

    const sorted = [...planets].sort((a, b) => {
      const aLong = a.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0
      const bLong = b.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0
      return aLong - bLong
    })

    const positions: { planet: Planet; theta: number; radius: number; longitude: number }[] = []
    const minSeparation = 8

    sorted.forEach((planet) => {
      const longitude = planet.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0
      const theta = toCanvasAngle(longitude)
      let radius = rPlanets

      for (const pos of positions) {
        const angleDiff = Math.abs(norm360(theta - pos.theta))
        const minDiff = Math.min(angleDiff, 360 - angleDiff)
        if (minDiff < minSeparation) {
          radius = pos.radius - 18
        }
      }

      positions.push({ planet, theta, radius, longitude })
    })

    return positions
  }, [planets, chartRotation, rPlanets])

  const planetPositionMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    planetPositions.forEach(({ planet, theta, radius }) => {
      const pos = polarToCartesian(cx, cy, radius, theta)
      map.set(planet.name, pos)
    })
    return map
  }, [planetPositions, cx, cy])

  if (!ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees) {
    return null
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      <defs>
        <filter id="glow-opposition" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-conjunction" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-trine" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-square" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-sextile" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Fondo */}
      <circle cx={cx} cy={cy} r={rOuter} fill="black" stroke="white" strokeWidth="1" />

      {/* Anillo de signos */}
      <circle cx={cx} cy={cy} r={rSignsInner} fill="none" stroke="white" strokeWidth="0.5" />

      {/* Líneas divisorias de signos (cada 30°) y glifos */}
      {SIGN_GLYPHS.map((glyph, i) => {
        const signStart = i * 30
        const signMid = signStart + 15

        const lineTheta = toCanvasAngle(signStart)
        const lineStart = polarToCartesian(cx, cy, rSignsInner, lineTheta)
        const lineEnd = polarToCartesian(cx, cy, rSignsOuter, lineTheta)

        const glyphTheta = toCanvasAngle(signMid)
        const glyphPos = polarToCartesian(cx, cy, rSignsMiddle, glyphTheta)

        return (
          <g key={`sign-${i}`}>
            <line x1={lineStart.x} y1={lineStart.y} x2={lineEnd.x} y2={lineEnd.y} stroke="white" strokeWidth="0.5" />
            <text
              x={glyphPos.x}
              y={glyphPos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={size * 0.035}
              className="font-mono"
            >
              {glyph}
            </text>
          </g>
        )
      })}

      {/* Líneas de casas */}
      {houseCusps.map((cusp, i) => {
        const theta = toCanvasAngle(cusp)
        const start = polarToCartesian(cx, cy, rHousesInner, theta)
        const end = polarToCartesian(cx, cy, rHousesOuter, theta)

        const midAngle = toCanvasAngle(norm360(cusp + 15))
        const numPos = polarToCartesian(cx, cy, rHousesInner + 15, midAngle)

        return (
          <g key={`house-${i}`}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="white"
              strokeWidth={i === 0 || i === 3 || i === 6 || i === 9 ? "1" : "0.3"}
              opacity={i === 0 || i === 3 || i === 6 || i === 9 ? 1 : 0.5}
            />
            <text
              x={numPos.x}
              y={numPos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={size * 0.02}
              opacity="0.6"
              className="font-mono"
            >
              {i + 1}
            </text>
          </g>
        )
      })}

      {/* Eje ASC-DSC */}
      {(() => {
        const thetaASC = toCanvasAngle(ascDegrees)
        const thetaDSC = toCanvasAngle(norm360(ascDegrees + 180))
        const ascStart = polarToCartesian(cx, cy, rHousesInner, thetaASC)
        const ascEnd = polarToCartesian(cx, cy, rSignsOuter, thetaASC)
        const ascLabel = polarToCartesian(cx, cy, rSignsOuter + 12, thetaASC)
        const dscLabel = polarToCartesian(cx, cy, rSignsOuter + 12, thetaDSC)

        return (
          <g>
            <line x1={ascStart.x} y1={ascStart.y} x2={ascEnd.x} y2={ascEnd.y} stroke="#FFD700" strokeWidth="2" />
            <text
              x={ascLabel.x}
              y={ascLabel.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#FFD700"
              fontSize={size * 0.025}
              fontWeight="bold"
              className="font-mono"
            >
              ASC
            </text>
            <text
              x={dscLabel.x}
              y={dscLabel.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#FFD700"
              fontSize={size * 0.025}
              opacity="0.7"
              className="font-mono"
            >
              DSC
            </text>
          </g>
        )
      })()}

      {/* Eje MC-IC */}
      {mcDegrees !== 0 &&
        (() => {
          const thetaMC = toCanvasAngle(mcDegrees)
          const thetaIC = toCanvasAngle(norm360(mcDegrees + 180))
          const mcStart = polarToCartesian(cx, cy, rHousesInner, thetaMC)
          const mcEnd = polarToCartesian(cx, cy, rSignsOuter, thetaMC)
          const mcLabel = polarToCartesian(cx, cy, rSignsOuter + 12, thetaMC)
          const icLabel = polarToCartesian(cx, cy, rSignsOuter + 12, thetaIC)

          return (
            <g>
              <line x1={mcStart.x} y1={mcStart.y} x2={mcEnd.x} y2={mcEnd.y} stroke="#FFD700" strokeWidth="2" />
              <text
                x={mcLabel.x}
                y={mcLabel.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#FFD700"
                fontSize={size * 0.025}
                fontWeight="bold"
                className="font-mono"
              >
                MC
              </text>
              <text
                x={icLabel.x}
                y={icLabel.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#FFD700"
                fontSize={size * 0.025}
                opacity="0.7"
                className="font-mono"
              >
                IC
              </text>
            </g>
          )
        })()}

      {/* Planetas */}
      {planetPositions.map(({ planet, theta, radius }) => {
        const pos = polarToCartesian(cx, cy, radius, theta)
        const glyphSrc = PLANET_GLYPH_SVGS[planet.name]
        const glyphFallback = planet.name[0]?.toUpperCase() || "?"
        const baseGlyphScale =
          planet.name === "sun" ? 0.945 : planet.name === "mars" ? 0.69 : planet.name === "venus" ? 0.88 : 1
        const glyphSize = size * 0.04 * baseGlyphScale
        const glyphGlowTiming = getGlyphGlowTiming(planet.name)
        const glyphGlowAnimation = `planet-glyph-glow ${glyphGlowTiming.durationSec}s ease-in-out ${glyphGlowTiming.delaySec}s infinite alternate`
        const glyphFilter =
          "drop-shadow(0 0 3.2px rgba(255,255,255,0.84)) drop-shadow(0 0 8px rgba(255,255,255,0.44))"
        const lineEnd = polarToCartesian(cx, cy, rSignsInner - 2, theta)

        return (
          <g key={planet.name}>
            <line x1={pos.x} y1={pos.y} x2={lineEnd.x} y2={lineEnd.y} stroke="white" strokeWidth="0.5" opacity="0.4" />
            <circle cx={pos.x} cy={pos.y} r={size * 0.028} fill="black" stroke="white" strokeWidth="0.5" />
            {glyphSrc ? (
              <image
                href={glyphSrc}
                x={pos.x - glyphSize / 2}
                y={pos.y - glyphSize / 2}
                width={glyphSize}
                height={glyphSize}
                preserveAspectRatio="xMidYMid meet"
                style={{
                  filter: glyphFilter,
                  animation: glyphGlowAnimation,
                }}
              />
            ) : (
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={size * 0.04}
                className="font-mono"
                style={{
                  filter: glyphFilter,
                  animation: glyphGlowAnimation,
                }}
              >
                {glyphFallback}
              </text>
            )}
          </g>
        )
      })}

      {/* Centro */}
      <circle cx={cx} cy={cy} r={rHousesInner} fill="black" stroke="white" strokeWidth="0.5" />

      {/* Aspectos */}
      {aspects.map((aspect, idx) => {
        const pos1 = planetPositionMap.get(aspect.point1.name)
        const pos2 = planetPositionMap.get(aspect.point2.name)

        if (!pos1 || !pos2) return null

        const style = ASPECT_STYLES[aspect.aspectType]
        if (!style) return null

        const filterId =
          aspect.aspectType === "Oposición"
            ? "glow-opposition"
            : aspect.aspectType === "Conjunción"
              ? "glow-conjunction"
              : aspect.aspectType === "Trígono"
                ? "glow-trine"
                : aspect.aspectType === "Cuadrado"
                  ? "glow-square"
                  : "glow-sextile"

        return (
          <line
            key={`aspect-${idx}`}
            x1={pos1.x}
            y1={pos1.y}
            x2={pos2.x}
            y2={pos2.y}
            stroke={style.color}
            strokeWidth={style.width}
            filter={`url(#${filterId})`}
            opacity={MAX_ASPECT_LINE_OPACITY}
          />
        )
      })}
    </svg>
  )
}
