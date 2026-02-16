"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { calculateCustomHoroscope, type HoroscopeData } from "@/lib/astrology"
import { GlyphAnimationManager } from "@/lib/glyph-animation"
import { usePlanetAudio, type OfflineMp3AspectEvent, type OfflineMp3PlanetEvent } from "@/lib/use-planet-audio"

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

const PLANET_GLYPH_FALLBACK_LABELS: Record<string, string> = {
  asc: "ASC",
  mc: "MC",
}

type SubjectFormData = {
  datetime: string
  location: string
  latitude: string
  longitude: string
}

type GeoSuggestion = {
  name: string
  country: string
  admin1?: string
  latitude: number
  longitude: number
  display: string
}

const PRESET_BA_FORM: SubjectFormData = {
  datetime: "1974-09-16T12:05",
  location: "Buenos Aires, Argentina",
  latitude: "-34.6037",
  longitude: "-58.3816",
}

const PRESET_CAIRO_FORM: SubjectFormData = {
  datetime: "1970-01-01T00:00",
  location: "El Cairo, Egipto",
  latitude: "30.0444",
  longitude: "31.2357",
}

const PRESET_BA77_FORM: SubjectFormData = {
  datetime: "1977-09-28T05:35",
  location: "Buenos Aires, Argentina",
  latitude: "-34.6037",
  longitude: "-58.3816",
}

const EMPTY_SUBJECT_FORM: SubjectFormData = {
  datetime: "",
  location: "",
  latitude: "",
  longitude: "",
}

const MODE_NAME_BY_SIGN_INDEX: Record<number, string> = {
  0: "Frigio dominante",
  1: "Dorico",
  2: "Lidio",
  3: "Eolico",
  4: "Jonico",
  5: "Eolico",
  6: "Jonico",
  7: "Frigio",
  8: "Mixolidio",
  9: "Menor armonico",
  10: "Lidio dominante",
  11: "Locrio",
}

type AudioEngineMode = "samples" | "hybrid" | "fm_pad" | "tibetan_bowls" | "tibetan_samples"
type NavigationMode = "astral_chord" | "radial" | "sequential" | "aspectual"

const SEQUENTIAL_PLANET_ORDER = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "sun",
]

const NAVIGATION_TRANSITION_MS = 5000
const CHART_PLANET_HOLD_MS = 15000
const NON_RADIAL_CROSSFADE_MS = 4000
const NON_RADIAL_JITTER_MS = 2000
const NON_RADIAL_INFRACTION_JITTER_MS = 2800
const NON_RADIAL_INFRACTION_PROBABILITY = 0.2
const NON_RADIAL_FADE_SLOWDOWN_MULTIPLIER = 3
const CHORD_POINTER_RADIUS = 16
const CHORD_ASPECTS_FADE_IN_MS = 14000
const CHORD_ASPECTS_HOLD_MS = 5000
const CHORD_ASPECTS_FADE_OUT_MS = 10000

const NAV_MODE_HINT_LABEL: Record<NavigationMode, string> = {
  astral_chord: "CHORD",
  radial: "RADIAL",
  sequential: "CHART",
  aspectual: "ASPECT",
}

const EARTH_CENTER_X = 200
const EARTH_CENTER_Y = 200
const EARTH_RADIUS = 10
const MAX_ASPECT_LINE_OPACITY = 0.7
const INTERACTIVE_PREVIEW_KEY = "__interactive_preview__"
const GLYPH_INTERACTION_SCALE = 1.3
const GLYPH_INTERACTION_FADE_MS = 700
const GLYPH_INTERACTION_FADE_OUT_EXTRA_MS = 4000
const GLYPH_INTERACTION_FADE_OUT_LEAD_MS = 4000
const ORBIT_POINTER_FILL_OPACITY = 0.1575 // +5%
const CHORD_POINTER_FILL_OPACITY = 0.126 // +5%

function getGlyphGlowTiming(glyphName: string) {
  let hash = 0
  for (let i = 0; i < glyphName.length; i += 1) {
    hash = (hash * 31 + glyphName.charCodeAt(i)) % 100000
  }
  const durationSec = 5 + (hash % 5000) / 1000 // 5s..10s
  const delaySec = -((Math.floor(hash / 7) % 10000) / 1000) // desync start phase
  return {
    durationSec: durationSec.toFixed(3),
    delaySec: delaySec.toFixed(3),
  }
}

function adjustPlanetPositions(planets: { name: string; degrees: number }[], minSeparation = 12) {
  const sorted = [...planets].sort((a, b) => a.degrees - b.degrees)
  const adjusted: { name: string; adjustedDegrees: number }[] = []

  for (let i = 0; i < sorted.length; i++) {
    let newDegrees = sorted[i].degrees

    for (const placed of adjusted) {
      const diff = Math.abs(newDegrees - placed.adjustedDegrees)
      const circularDiff = Math.min(diff, 360 - diff)

      if (circularDiff < minSeparation) {
        const halfSep = minSeparation / 2 + 2
        if (newDegrees >= placed.adjustedDegrees) {
          newDegrees = placed.adjustedDegrees + halfSep
        } else {
          newDegrees = placed.adjustedDegrees - halfSep
        }
      }
    }
    adjusted.push({ name: sorted[i].name, adjustedDegrees: norm360(newDegrees) })
  }
  return adjusted
}

// Normalizar ángulo a [0, 360)
function norm360(x: number): number {
  return ((x % 360) + 360) % 360
}

function getElementFromDegrees(degrees: number): "fire" | "earth" | "air" | "water" {
  const signIndex = Math.floor(norm360(degrees) / 30) % 12
  const elements = ["fire", "earth", "air", "water"] as const
  return elements[signIndex % 4]
}

// Convertir coordenadas polares a cartesianas (método AstroChart)
function polarToCartesian(cx: number, cy: number, r: number, thetaDeg: number) {
  const thetaRad = (thetaDeg * Math.PI) / 180
  return {
    x: cx + r * Math.cos(thetaRad),
    y: cy - Math.sin(thetaRad) * r, // Y invertido para SVG
  }
}

function trimLineSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
  trimStartPx = 15,
  trimEndPx = 15,
) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.hypot(dx, dy)
  if (distance <= trimStartPx + trimEndPx) return null

  const ux = dx / distance
  const uy = dy / distance

  return {
    x1: start.x + ux * trimStartPx,
    y1: start.y + uy * trimStartPx,
    x2: end.x - ux * trimEndPx,
    y2: end.y - uy * trimEndPx,
  }
}

function getZodiacSign(degrees: number) {}

function toCanvasAngle(degrees: number): number {
  return 180 - degrees
}

function sanitizeFileToken(raw: string, fallback: string): string {
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase()
  return normalized || fallback
}

const calculatePointerState = (elapsed: number, duration: number, ascDegrees: number) => {
  const progress = elapsed / duration
  const pointerAngle = norm360(180 + 360 * progress)
  const adjustedAngle = pointerAngle // Display shows pure pointer angle without ascendant modification
  return {
    pointerAngle,
    adjustedAngle, // This is the display value (pointer angle starting at 180° going counter-clockwise)
    pointerRotation: -360 * progress,
  }
}

export default function AstrologyCalculator() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSubject, setShowSubject] = useState(true)
  const [showPlanets, setShowPlanets] = useState(false)
  const [showAspects, setShowAspects] = useState(false) // changed to false - dynaspects is the main one
  const [showAspectGraph, setShowAspectGraph] = useState(false)
  const [showDynAspects, setShowDynAspects] = useState(true) // changed to true - this is the default visible one
  const [showAspectBox, setShowAspectBox] = useState(false) // New separate state for the info box
  const [activePlanetAspectsMap, setActivePlanetAspectsMap] = useState<
    Record<string, { aspects: Array<any>; opacity: number }>
  >({})

  const [dynAspectsOpacity, setDynAspectsOpacity] = useState(0)
  const [showChart, setShowChart] = useState(true)
  const [showCircle, setShowCircle] = useState(false)
  const [showMatrix, setShowMatrix] = useState(false)
  const [showDegrees, setShowDegrees] = useState(false)
  const [showAngles, setShowAngles] = useState(false)
  const [showAstroChart, setShowAstroChart] = useState(false)
  const [peakLevelLeftPre, setPeakLevelLeftPre] = useState(0)
  const [peakLevelRightPre, setPeakLevelRightPre] = useState(0)
  const [peakLevelLeftPost, setPeakLevelLeftPost] = useState(0)
  const [peakLevelRightPost, setPeakLevelRightPost] = useState(0)
  const [showPointer, setShowPointer] = useState(true)
  const [showPointerInfo, setShowPointerInfo] = useState(false)
  const [showVuMeter, setShowVuMeter] = useState(false)
  const [showModeInfo, setShowModeInfo] = useState(false)
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("radial")
  const [exportMode, setExportMode] = useState<NavigationMode>("radial")
  const [isExportingMp3, setIsExportingMp3] = useState(false)
  const [pendingMp3Download, setPendingMp3Download] = useState<{ url: string; fileName: string } | null>(null)
  const [isSidereal, setIsSidereal] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<"ba" | "cairo" | "manual" | "ba77">("manual")
  const [formData, setFormData] = useState<SubjectFormData>(EMPTY_SUBJECT_FORM)
  const [horoscopeData, setHoroscopeData] = useState<HoroscopeData | null>(null)
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState(false)

  const [loopDuration, setLoopDuration] = useState(180)
  const [isLoopRunning, setIsLoopRunning] = useState(false)
  const [pointerRotation, setPointerRotation] = useState(0)
  const [pointerOpacity, setPointerOpacity] = useState(1)
  const [pointerOpacityTransitionMs, setPointerOpacityTransitionMs] = useState(0)
  const [chartAspectsTransitionMs, setChartAspectsTransitionMs] = useState(0)
  const [chordAspectsTransitionMs, setChordAspectsTransitionMs] = useState(CHORD_ASPECTS_FADE_IN_MS)
  const [startButtonScale, setStartButtonScale] = useState(1)

  const [audioFadeIn, setAudioFadeIn] = useState(5)
  const [audioFadeOut, setAudioFadeOut] = useState(10)
  const [backgroundVolume, setBackgroundVolume] = useState(2)
  const [elementSoundVolume, setElementSoundVolume] = useState(2)
  const [dynAspectsFadeIn, setDynAspectsFadeIn] = useState(3)
  const [dynAspectsSustain, setDynAspectsSustain] = useState(2)
  const [dynAspectsFadeOut, setDynAspectsFadeOut] = useState(15)

  const [aspectsSoundVolume, setAspectsSoundVolume] = useState(30)
  const [masterVolume, setMasterVolume] = useState(50) // Nuevo estado para controlar volumen maestro (0-100%)
  const [reverbMixPercent, setReverbMixPercent] = useState(20)
  const [chordReverbMixPercent, setChordReverbMixPercent] = useState(40)
  const [tuningCents, setTuningCents] = useState(0)
  const [modalEnabled, setModalEnabled] = useState(true)
  const [audioEngineMode, setAudioEngineMode] = useState<AudioEngineMode>("samples")
  const [synthVolume, setSynthVolume] = useState(450)

  const [glyphAnimationManager] = useState(() => new GlyphAnimationManager())
  const [animatedPlanets, setAnimatedPlanets] = useState<Record<string, number>>({})

  const [startButtonPhase, setStartButtonPhase] = useState<"contracted" | "expanding" | "stable">("contracted")
  const [currentPlanetUnderPointer, setCurrentPlanetUnderPointer] = useState<string | null>(null)
  const [showAstrofono, setShowAstrofono] = useState(false) // Declared showAstrofono
  const [debugPointerAngle, setDebugPointerAngle] = useState(0) // Added state to track pointer angle for debugging
  const animationFrameIdRef = useRef<number | null>(null)
  const loopStartTimeRef = useRef(0)
  const loopElapsedBeforePauseMsRef = useRef(0)
  const lastUiCommitTimeRef = useRef(0)
  const startButtonPhaseTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const navigationStepTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const navigationTimeoutsRef = useRef<NodeJS.Timeout[]>([])
  const navigationRunIdRef = useRef(0)
  const lastClickTimeRef = useRef<number>(0)
  const [isPaused, setIsPaused] = useState(false)

  const [hoveredGlyph, setHoveredGlyph] = useState<string | null>(null)
  const [pressedGlyph, setPressedGlyph] = useState<string | null>(null)
  const [glyphHoverOpacity, setGlyphHoverOpacity] = useState(0)
  const [showAspectIndicator, setShowAspectIndicator] = useState(false) // Declared showAspectIndicator
  const aspectClickTimersRef = useRef<Record<string, NodeJS.Timeout[]>>({})
  const affectedScaleTimersRef = useRef<Record<string, { start: NodeJS.Timeout | null; end: NodeJS.Timeout | null }>>(
    {},
  )
  const glyphScaleTriggerLockRef = useRef<Record<string, number>>({})
  const pressedGlyphReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interactivePreviewClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextAutoCalculateRef = useRef(false)
  const [locationSuggestions, setLocationSuggestions] = useState<GeoSuggestion[]>([])
  const [isResolvingLocation, setIsResolvingLocation] = useState(false)
  const chartAspectsKeyRef = useRef("__chart__")

  const modalSunSignIndex = useMemo(() => {
    const sunDegrees = horoscopeData?.planets?.find((p) => p.name === "sun")?.ChartPosition?.Ecliptic?.DecimalDegrees
    if (typeof sunDegrees !== "number" || Number.isNaN(sunDegrees)) return null
    return Math.floor(norm360(sunDegrees) / 30) % 12
  }, [horoscopeData?.planets])

  const currentModeLabel =
    modalSunSignIndex !== null ? MODE_NAME_BY_SIGN_INDEX[modalSunSignIndex] || "Modal" : "Modal"

  const effectiveMasterVolume = navigationMode === "astral_chord" ? masterVolume * 0.6 : masterVolume

  // Added hook for planet audio
  const {
    playPlanetSound,
    stopAll,
    playBackgroundSound,
    stopBackgroundSound,
    playElementBackground,
    stopElementBackground,
    loadingProgress,
    audioLevelLeftPre,
    audioLevelRightPre,
    audioLevelLeftPost,
    audioLevelRightPost,
    compressionReductionDb,
    renderOfflineMp3,
  } =
    usePlanetAudio({
      fadeIn: audioFadeIn,
      fadeOut: audioFadeOut,
      backgroundVolume: backgroundVolume,
      elementSoundVolume: elementSoundVolume,
      aspectsSoundVolume: aspectsSoundVolume,
      masterVolume: effectiveMasterVolume,
      tuningCents: tuningCents,
      dynAspectsFadeIn: dynAspectsFadeIn,
      dynAspectsSustain: dynAspectsSustain,
      dynAspectsFadeOut: dynAspectsFadeOut,
      modalEnabled,
      modalSunSignIndex,
      audioEngineMode,
      synthVolume,
      vuEnabled: showVuMeter,
      isChordMode: navigationMode === "astral_chord",
      reverbMixPercent,
      chordReverbMixPercent,
    })
  const lastPlayedPlanetRef = useRef<string | null>(null)
  const clearAspectTimers = useCallback(() => {
    Object.values(aspectClickTimersRef.current).forEach((timers) => {
      timers.forEach((timerId) => clearTimeout(timerId))
    })
    aspectClickTimersRef.current = {}
  }, [])

  useEffect(() => {
    if (showSubject) return
    if (skipNextAutoCalculateRef.current) {
      skipNextAutoCalculateRef.current = false
      return
    }

    const birthDateTime = formData.datetime.trim()
    const [birthDate, birthTime] = birthDateTime.split("T")
    const latitude = Number.parseFloat(formData.latitude.replace(",", "."))
    const longitude = Number.parseFloat(formData.longitude.replace(",", "."))

    if (!birthDate || !birthTime || Number.isNaN(latitude) || Number.isNaN(longitude)) return

    const calculateHoroscope = async () => {
      try {
        console.log("[v0] Calculating with isSidereal:", isSidereal)
        const data = await calculateCustomHoroscope(birthDate, birthTime, latitude, longitude, isSidereal, selectedPreset)
        console.log("[v0] Horoscope data received:", data)
        console.log("[v0] Aspects found:", data.aspects?.length || 0, data.aspects)
        if (!data?.planets?.length) return
        setHoroscopeData(data)
        setShowChart(true)
      } catch (calcError) {
        console.error("[v0] Auto-calculate failed:", calcError)
      }
    }

    calculateHoroscope()
  }, [formData, isSidereal, selectedPreset, showSubject])

  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current)
        animationFrameIdRef.current = null
      }
      if (navigationStepTimeoutRef.current) {
        clearTimeout(navigationStepTimeoutRef.current)
        navigationStepTimeoutRef.current = null
      }
      if (navigationTimeoutsRef.current.length > 0) {
        navigationTimeoutsRef.current.forEach((timerId) => clearTimeout(timerId))
        navigationTimeoutsRef.current = []
      }
      clearAspectTimers()
      if (startButtonPhaseTimeoutRef.current) {
        clearTimeout(startButtonPhaseTimeoutRef.current)
        startButtonPhaseTimeoutRef.current = null
      }
      if (pressedGlyphReleaseTimeoutRef.current) {
        clearTimeout(pressedGlyphReleaseTimeoutRef.current)
        pressedGlyphReleaseTimeoutRef.current = null
      }
      if (interactivePreviewClearTimeoutRef.current) {
        clearTimeout(interactivePreviewClearTimeoutRef.current)
        interactivePreviewClearTimeoutRef.current = null
      }
    }
  }, [clearAspectTimers])

  // Track peak audio level (pre/post) and reset every 5 seconds
  useEffect(() => {
    if (audioLevelLeftPre > peakLevelLeftPre) {
      setPeakLevelLeftPre(audioLevelLeftPre)
    }
    if (audioLevelRightPre > peakLevelRightPre) {
      setPeakLevelRightPre(audioLevelRightPre)
    }
    if (audioLevelLeftPost > peakLevelLeftPost) {
      setPeakLevelLeftPost(audioLevelLeftPost)
    }
    if (audioLevelRightPost > peakLevelRightPost) {
      setPeakLevelRightPost(audioLevelRightPost)
    }
  }, [
    audioLevelLeftPre,
    audioLevelRightPre,
    audioLevelLeftPost,
    audioLevelRightPost,
    peakLevelLeftPre,
    peakLevelRightPre,
    peakLevelLeftPost,
    peakLevelRightPost,
  ])

  useEffect(() => {
    if (!showVuMeter) {
      setPeakLevelLeftPre(0)
      setPeakLevelRightPre(0)
      setPeakLevelLeftPost(0)
      setPeakLevelRightPost(0)
      return
    }

    const peakResetInterval = setInterval(() => {
      setPeakLevelLeftPre(0)
      setPeakLevelRightPre(0)
      setPeakLevelLeftPost(0)
      setPeakLevelRightPost(0)
    }, 5000)
    
    return () => clearInterval(peakResetInterval)
  }, [showVuMeter])

  const percentToDb = (percent: number) => {
    const db = (percent / 100) * 60 - 60
    return Math.max(-60, Math.min(0, db))
  }

  const formatSuggestion = (name: string, admin1: string | undefined, country: string) => {
    return [name, admin1, country].filter(Boolean).join(", ")
  }

  const searchLocation = useCallback(async (query: string, count = 6): Promise<GeoSuggestion[]> => {
    const trimmed = query.trim()
    if (!trimmed) return []

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=${count}&language=es&format=json`
    const response = await fetch(url)
    if (!response.ok) return []

    const payload = await response.json()
    const results = Array.isArray(payload?.results) ? payload.results : []
    return results
      .filter((item: any) => item?.name && item?.country && Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude))
      .map((item: any) => ({
        name: item.name,
        country: item.country,
        admin1: item.admin1,
        latitude: item.latitude,
        longitude: item.longitude,
        display: formatSuggestion(item.name, item.admin1, item.country),
      }))
  }, [])

  const resolveLocationAndUpdateCoords = useCallback(
    async (rawLocation: string) => {
      const input = rawLocation.trim()
      if (!input) return null

      setIsResolvingLocation(true)
      try {
        const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim()
        const normalizedInput = normalize(input)
        const pool = locationSuggestions.length > 0 ? locationSuggestions : await searchLocation(input, 8)

        let best = pool.find((item) => normalize(item.display) === normalizedInput)
        if (!best) {
          best = pool.find((item) => normalize(item.display).includes(normalizedInput))
        }
        if (!best) {
          const fallback = await searchLocation(input, 1)
          best = fallback[0]
        }
        if (!best) return null
        const selected = best

        setFormData((prev) => ({
          ...prev,
          location: selected.display,
          latitude: selected.latitude.toFixed(4),
          longitude: selected.longitude.toFixed(4),
        }))
        setLocationSuggestions((prev) => (prev.length > 0 ? prev : [selected]))
        return selected
      } catch {
        return null
      } finally {
        setIsResolvingLocation(false)
      }
    },
    [locationSuggestions, searchLocation],
  )

  useEffect(() => {
    if (!showSubject || selectedPreset !== "manual") return

    const q = formData.location.trim()
    if (q.length < 2) {
      setLocationSuggestions([])
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchLocation(q, 6)
        setLocationSuggestions(results)
      } catch {
        setLocationSuggestions([])
      }
    }, 220)

    return () => clearTimeout(timeoutId)
  }, [formData.location, searchLocation, selectedPreset, showSubject])

  useEffect(() => {
    if (selectedPreset !== "manual" || !showSubject) {
      setLocationSuggestions([])
    }
  }, [selectedPreset, showSubject])

  const cancelPointerLoop = useCallback(() => {
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current)
      animationFrameIdRef.current = null
    }
  }, [])

  const detectPlanetUnderPointer = useCallback(
    (adjustedAngle: number, ascDegrees: number): string | null => {
      if (!horoscopeData?.planets) return null
      const chartRotation = 180 - ascDegrees

      for (const planet of horoscopeData.planets) {
        const planetDegrees = planet.ChartPosition.Ecliptic.DecimalDegrees
        const planetCanvasAngle = norm360(planetDegrees + chartRotation)
        const diff = Math.abs(adjustedAngle - planetCanvasAngle)
        const circularDiff = Math.min(diff, 360 - diff)
        if (circularDiff < 5) return planet.name
      }
      return null
    },
    [horoscopeData?.planets],
  )

  const triggerPlanetAudioAtPointer = useCallback(
    (
      planetName: string,
      adjustedAngle: number,
      options?: { aspectsPoint1Only?: boolean; forceChordProfile?: boolean },
    ) => {
      const planet = horoscopeData?.planets?.find((p) => p.name === planetName)
      if (!planet) return

      const aspectsPoint1Only = options?.aspectsPoint1Only ?? false
      const aspectsForPlanet =
        horoscopeData?.aspects?.filter(
          (aspect) =>
            (aspect.point1.name.toLowerCase() === planetName.toLowerCase() ||
              aspect.point2.name.toLowerCase() === planetName.toLowerCase()) &&
            ["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"].includes(aspect.aspectType) &&
            (!aspectsPoint1Only || aspect.point1.name.toLowerCase() === planetName.toLowerCase()),
        ) || []

      playPlanetSound(
        planetName,
        adjustedAngle,
        planet.declination || 0,
        aspectsForPlanet,
        horoscopeData?.planets || [],
        horoscopeData?.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees || 0,
        horoscopeData?.mc?.ChartPosition?.Ecliptic?.DecimalDegrees || 0,
        undefined,
        options?.forceChordProfile
          ? {
              wetMix: Math.max(0, Math.min(1, chordReverbMixPercent / 100)),
              decaySeconds: 5,
              gainMultiplier: 1.1,
              fadeOutScale: 2,
              fadeOutCurve: "s",
            }
          : undefined,
      )
    },
    [
      horoscopeData?.aspects,
      horoscopeData?.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees,
      horoscopeData?.mc?.ChartPosition?.Ecliptic?.DecimalDegrees,
      horoscopeData?.planets,
      chordReverbMixPercent,
      playPlanetSound,
    ],
  )

  const beginPointerLoop = useCallback(
    (initialElapsedMs: number) => {
      if (!horoscopeData) return

      const ascDegrees = horoscopeData.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0
      const totalDuration = loopDuration * 1000
      const uiCommitIntervalMs = 66

      loopStartTimeRef.current = performance.now() - Math.max(0, initialElapsedMs)
      lastUiCommitTimeRef.current = 0

      const tick = () => {
        const now = performance.now()
        const elapsed = now - loopStartTimeRef.current
        const boundedElapsed = Math.min(elapsed, totalDuration)
        const state = calculatePointerState(boundedElapsed, totalDuration, ascDegrees)
        const detectedPlanet = detectPlanetUnderPointer(state.adjustedAngle, ascDegrees)

        if (detectedPlanet && detectedPlanet !== lastPlayedPlanetRef.current) {
          triggerPlanetAudioAtPointer(detectedPlanet, state.adjustedAngle)
          lastPlayedPlanetRef.current = detectedPlanet
        } else if (!detectedPlanet) {
          lastPlayedPlanetRef.current = null
        }

        if (lastUiCommitTimeRef.current === 0 || now - lastUiCommitTimeRef.current >= uiCommitIntervalMs) {
          lastUiCommitTimeRef.current = now
          setPointerRotation(state.pointerRotation)
          setDebugPointerAngle(Math.round(state.adjustedAngle))
          setCurrentPlanetUnderPointer(detectedPlanet)
        }

        if (elapsed >= totalDuration) {
          cancelPointerLoop()
          loopElapsedBeforePauseMsRef.current = 0
          setPointerRotation(180)
          setPointerOpacity(1)
          setPointerOpacityTransitionMs(0)
          setChartAspectsTransitionMs(0)
          setChordAspectsTransitionMs(CHORD_ASPECTS_FADE_IN_MS)
          setIsLoopRunning(false)
          setIsPaused(false)
          setCurrentPlanetUnderPointer(null)
          setDebugPointerAngle(0)
          setStartButtonPhase("contracted")
          stopBackgroundSound()
          stopElementBackground()
          return
        }

        animationFrameIdRef.current = requestAnimationFrame(tick)
      }

      cancelPointerLoop()
      animationFrameIdRef.current = requestAnimationFrame(tick)
    },
    [
      cancelPointerLoop,
      detectPlanetUnderPointer,
      horoscopeData,
      loopDuration,
      stopBackgroundSound,
      stopElementBackground,
      triggerPlanetAudioAtPointer,
    ],
  )

  const clearNavigationTimeouts = useCallback(() => {
    if (navigationStepTimeoutRef.current) {
      clearTimeout(navigationStepTimeoutRef.current)
      navigationStepTimeoutRef.current = null
    }
    if (navigationTimeoutsRef.current.length > 0) {
      navigationTimeoutsRef.current.forEach((timerId) => clearTimeout(timerId))
      navigationTimeoutsRef.current = []
    }
  }, [])

  const cancelAllNavigationSchedulers = useCallback(() => {
    cancelPointerLoop()
    clearNavigationTimeouts()
    navigationRunIdRef.current += 1
  }, [cancelPointerLoop, clearNavigationTimeouts])

  useEffect(() => {
    if (!isLoopRunning) {
      lastPlayedPlanetRef.current = null
      // When loop ends, stop background sound
      stopBackgroundSound()
      stopElementBackground()
    }
  }, [isLoopRunning, stopBackgroundSound, stopElementBackground])

  useEffect(() => {
    if (hoveredGlyph) {
      let opacity = 0
      const fadeInInterval = setInterval(() => {
        opacity += 0.02 // 5 seconds / 100 steps = 50ms per step
        if (opacity >= 1) {
          opacity = 1
          clearInterval(fadeInInterval)
        }
        setGlyphHoverOpacity(opacity)
      }, 50)

      return () => {
        clearInterval(fadeInInterval)
      }
    } else {
      if (glyphHoverOpacity > 0) {
        let opacity = glyphHoverOpacity
        const fadeOutInterval = setInterval(() => {
          opacity -= 0.02
          if (opacity < 0) {
            opacity = 0
            clearInterval(fadeOutInterval)
          }
          setGlyphHoverOpacity(opacity)
        }, 50)

        return () => {
          clearInterval(fadeOutInterval)
        }
      }
    }
  }, [hoveredGlyph, glyphHoverOpacity])

  useEffect(() => {
    if (
      navigationMode === "astral_chord" ||
      navigationMode === "sequential" ||
      navigationMode === "aspectual" ||
      !showDynAspects ||
      !currentPlanetUnderPointer ||
      !horoscopeData?.aspects
    ) {
      return
    }

    const planet = horoscopeData?.planets?.find((p) => p.name.toLowerCase() === currentPlanetUnderPointer.toLowerCase())
    if (!planet) return

    const aspectsForPlanet = horoscopeData.aspects.filter(
      (aspect) =>
        (aspect.point1.name.toLowerCase() === currentPlanetUnderPointer.toLowerCase() ||
          aspect.point2.name.toLowerCase() === currentPlanetUnderPointer.toLowerCase()) &&
        ["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"].includes(aspect.aspectType),
    )

    if (aspectsForPlanet.length === 0) return

    const fadeInInterval = setInterval(() => {
      setActivePlanetAspectsMap((prevMap) => {
        const current = prevMap[currentPlanetUnderPointer] || { aspects: aspectsForPlanet, opacity: 0 }
        const targetOpacity = MAX_ASPECT_LINE_OPACITY
        const increment = targetOpacity / (dynAspectsFadeIn * 10) // Divide by (seconds * 10) for 100ms intervals
        const newOpacity = Math.min(current.opacity + increment, targetOpacity)

        return {
          ...prevMap,
          [currentPlanetUnderPointer]: {
            aspects: aspectsForPlanet,
            opacity: newOpacity,
          },
        }
      })
    }, 100)

    const fadeInTimeout = setTimeout(() => {
      clearInterval(fadeInInterval)
    }, dynAspectsFadeIn * 1000)

    return () => {
      clearInterval(fadeInInterval)
      clearTimeout(fadeInTimeout)
    }
  }, [currentPlanetUnderPointer, showDynAspects, dynAspectsFadeIn, horoscopeData?.aspects, navigationMode])

  useEffect(() => {
    if (navigationMode === "astral_chord" || navigationMode === "sequential" || navigationMode === "aspectual") {
      return
    }
    if (
      showDynAspects &&
      currentPlanetUnderPointer === null &&
      !hoveredGlyph &&
      !pressedGlyph &&
      Object.keys(activePlanetAspectsMap).length > 0
    ) {
      const fadeOutInterval = setInterval(() => {
        setActivePlanetAspectsMap((prevMap) => {
          const result = { ...prevMap }
          const targetOpacity = 0
          const decrement = MAX_ASPECT_LINE_OPACITY / (dynAspectsFadeOut * 10) // Divide by (seconds * 10) for 100ms intervals

          Object.keys(result).forEach((planetName) => {
            result[planetName].opacity = Math.max(result[planetName].opacity - decrement, targetOpacity)
          })

          const hasVisibleAspects = Object.values(result).some((data) => data.opacity > 0)
          if (!hasVisibleAspects) {
            return {}
          }

          return result
        })
      }, 100)

      const fadeOutTimeout = setTimeout(() => {
        clearInterval(fadeOutInterval)
        setActivePlanetAspectsMap({})
      }, dynAspectsFadeOut * 1000)

      return () => {
        clearInterval(fadeOutInterval)
        clearTimeout(fadeOutTimeout)
      }
    }
  }, [currentPlanetUnderPointer, showDynAspects, activePlanetAspectsMap, dynAspectsFadeOut, navigationMode, hoveredGlyph, pressedGlyph])

  useEffect(() => {
    return () => {
      if (pendingMp3Download?.url) {
        URL.revokeObjectURL(pendingMp3Download.url)
      }
    }
  }, [pendingMp3Download])

  const resetToInitialState = () => {
    setIsExportingMp3(false)
    setPendingMp3Download(null)
    cancelAllNavigationSchedulers()
    clearAspectTimers()
    loopStartTimeRef.current = 0
    loopElapsedBeforePauseMsRef.current = 0
    lastUiCommitTimeRef.current = 0
    if (startButtonPhaseTimeoutRef.current) {
      clearTimeout(startButtonPhaseTimeoutRef.current)
      startButtonPhaseTimeoutRef.current = null
    }
    setIsLoopRunning(false)
    setIsPaused(false)
    setPointerRotation(180)
    setPointerOpacity(1)
    setPointerOpacityTransitionMs(0)
    setChartAspectsTransitionMs(0)
    setChordAspectsTransitionMs(CHORD_ASPECTS_FADE_IN_MS)
    setCurrentPlanetUnderPointer(null)
    setDebugPointerAngle(0)
    setStartButtonPhase("contracted")
    lastClickTimeRef.current = 0
    glyphAnimationManager["animations"]?.clear()
    setAnimatedPlanets({})
    stopBackgroundSound()
    stopElementBackground()
    setHoveredGlyph(null)
    setPressedGlyph(null)
    setGlyphHoverOpacity(0)
    setActivePlanetAspectsMap({})
    if (pressedGlyphReleaseTimeoutRef.current) {
      clearTimeout(pressedGlyphReleaseTimeoutRef.current)
      pressedGlyphReleaseTimeoutRef.current = null
    }
    if (interactivePreviewClearTimeoutRef.current) {
      clearTimeout(interactivePreviewClearTimeoutRef.current)
      interactivePreviewClearTimeoutRef.current = null
    }
    stopAll()
    setShowSubject(false)
    setShowChart(true)
    setError("")
    setElementSoundVolume(2)
    setBackgroundVolume(2)
    setAspectsSoundVolume(30)
    setMasterVolume(50)
    setReverbMixPercent(20)
    setChordReverbMixPercent(40)
    setSynthVolume(450)
    setModalEnabled(true)
    setAudioEngineMode("samples")
    setLoopDuration(180)
    setShowDynAspects(true)
    setShowAspectGraph(false)
    setShowAspectBox(false)
    setShowAspectIndicator(false)
    setShowPlanets(false)
    setShowAspects(false)
    setShowMatrix(false)
    setShowCircle(false)
    setShowDegrees(false)
    setShowAngles(false)
    setShowAstroChart(false)
    setShowPointer(true)
    setShowPointerInfo(false)
    setShowVuMeter(false)
    setShowModeInfo(false)
    setIsSidereal(false)
  }

  const startAmbientBed = (options?: { playBackground?: boolean; playElement?: boolean; elementVolumeOverride?: number }) => {
    const playBackground = options?.playBackground ?? true
    const playElement = options?.playElement ?? true

    if (playBackground) {
      playBackgroundSound()
    } else {
      stopBackgroundSound()
    }

    if (!playElement) {
      stopElementBackground()
      return
    }

    if (horoscopeData?.planets && horoscopeData?.ascendant) {
      const sunDegrees = horoscopeData.planets.find((p) => p.name === "sun")?.ChartPosition.Ecliptic.DecimalDegrees
      if (sunDegrees !== undefined) {
        playElementBackground(
          getElementFromDegrees(sunDegrees),
          undefined,
          0,
          30,
          {
            modalEnabled,
            sunSignIndex: modalSunSignIndex,
          },
          options?.elementVolumeOverride,
        )
      }
    }
  }

  const setPointerAngle = (angle: number, currentPlanet: string | null) => {
    const normalized = norm360(angle)
    // Pointer base is at 180° (left) and CSS rotate is clockwise-positive.
    // Convert chart angle (counter-clockwise-positive) into CSS rotation.
    setPointerRotation(180 - normalized)
    setDebugPointerAngle(Math.round(normalized))
    setCurrentPlanetUnderPointer(currentPlanet)
  }

  const getPlanetDialAngle = (planetName: string): number | null => {
    const normalizedName = planetName.toLowerCase()
    const planet = horoscopeData?.planets?.find((p) => p.name.toLowerCase() === normalizedName)
    if (!planet || !horoscopeData?.ascendant) return null
    const degree = adjustedPositions[planet.name] ?? planet.ChartPosition.Ecliptic.DecimalDegrees
    const chartRotation = 180 - horoscopeData.ascendant.ChartPosition.Ecliptic.DecimalDegrees
    return norm360(degree + chartRotation)
  }

  const buildSequentialRoute = (): string[] => {
    if (!horoscopeData?.planets) return []
    const available = new Set(horoscopeData.planets.map((p) => p.name.toLowerCase()))
    return SEQUENTIAL_PLANET_ORDER.filter((name) => available.has(name))
  }

  const buildAspectualRoute = (): string[] => {
    if (!horoscopeData?.planets) return []
    const allowedAspects = new Set(["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"])
    const aspectWeight: Record<string, number> = {
      "Conjunción": 3,
      "Cuadrado": 2.8,
      "Oposición": 2.6,
      "Trígono": 2.1,
      "Sextil": 1.6,
    }
    const planets = horoscopeData.planets.map((p) => p.name.toLowerCase())
    const planetSet = new Set(planets)
    const score: Record<string, number> = Object.fromEntries(planets.map((name) => [name, 0]))
    const links: Record<string, Record<string, number>> = Object.fromEntries(planets.map((name) => [name, {}]))

    for (const aspect of horoscopeData.aspects || []) {
      if (!allowedAspects.has(aspect.aspectType)) continue
      const a = aspect.point1.name.toLowerCase()
      const b = aspect.point2.name.toLowerCase()
      if (!planetSet.has(a) || !planetSet.has(b) || a === b) continue
      const weight = aspectWeight[aspect.aspectType] ?? 1
      score[a] += weight
      score[b] += weight
      links[a][b] = (links[a][b] ?? 0) + weight
      links[b][a] = (links[b][a] ?? 0) + weight
    }

    const start = [...planets].sort((a, b) => {
      const scoreDelta = (score[b] ?? 0) - (score[a] ?? 0)
      if (scoreDelta !== 0) return scoreDelta
      if (a === "sun") return -1
      if (b === "sun") return 1
      return a.localeCompare(b)
    })[0]
    if (!start) return []

    const route = [start]
    const unvisited = new Set(planets.filter((name) => name !== start))
    while (unvisited.size > 0) {
      const current = route[route.length - 1]
      const next = [...unvisited].sort((a, b) => {
        const aScore = (links[current]?.[a] ?? 0) * 1.4 + (score[a] ?? 0) * 0.6
        const bScore = (links[current]?.[b] ?? 0) * 1.4 + (score[b] ?? 0) * 0.6
        if (bScore !== aScore) return bScore - aScore
        return a.localeCompare(b)
      })[0]
      route.push(next)
      unvisited.delete(next)
    }

    route.push(start)
    return route
  }

  const startNonRadialRoute = (
    route: string[],
    options?: {
      teleport?: boolean
      holdMs?: number
      crossfadeMs?: number
      chartAspects?: boolean
      fadeInSpeedMultiplier?: number
      fadeTransitionMultiplier?: number
      shrinkHoldForFade?: boolean
      forceContinuousFade?: boolean
      audioLeadMs?: number
      jitterMs?: number
      infractionProbability?: number
      infractionJitterMs?: number
    },
  ) => {
    const resolvedRoute = route
      .map((name) => ({ name, angle: getPlanetDialAngle(name) }))
      .filter((item): item is { name: string; angle: number } => item.angle !== null)
    if (resolvedRoute.length === 0) {
      setIsLoopRunning(false)
      setStartButtonPhase("contracted")
      return
    }

    const teleport = options?.teleport ?? false
    const holdMs = Math.max(0, options?.holdMs ?? 0)
    const crossfadeMs = Math.max(0, options?.crossfadeMs ?? NAVIGATION_TRANSITION_MS)
    const chartAspects = options?.chartAspects ?? false
    const fadeInSpeedMultiplier = Math.max(1, options?.fadeInSpeedMultiplier ?? 1)
    const fadeTransitionMultiplier = Math.max(1, options?.fadeTransitionMultiplier ?? 1)
    const shrinkHoldForFade = options?.shrinkHoldForFade ?? false
    const forceContinuousFade = options?.forceContinuousFade ?? false
    const audioLeadMs = Math.max(0, options?.audioLeadMs ?? 0)
    const jitterMs = Math.max(0, options?.jitterMs ?? 0)
    const infractionProbability = Math.min(1, Math.max(0, options?.infractionProbability ?? 0))
    const infractionJitterMs = Math.max(jitterMs, options?.infractionJitterMs ?? jitterMs)
    const baseHalfFadeMs = Math.max(0, Math.floor(crossfadeMs / 2))
    const baseFadeInMs = Math.max(0, Math.floor(baseHalfFadeMs / fadeInSpeedMultiplier))
    const halfFadeMs = Math.max(0, Math.floor(baseHalfFadeMs * fadeTransitionMultiplier))
    const fadeInMs = Math.max(0, Math.floor(baseFadeInMs * fadeTransitionMultiplier))
    const transitionFadeDurationMs = Math.max(0, halfFadeMs + fadeInMs)
    const runId = navigationRunIdRef.current
    const uiCommitIntervalMs = 33
    let lastUiCommitMs = 0
    let stepIndex = 0

    setPointerOpacity(1)
    setPointerOpacityTransitionMs(0)
    setChartAspectsTransitionMs(0)
    setPointerAngle(resolvedRoute[0].angle, resolvedRoute[0].name)
    triggerPlanetAudioAtPointer(resolvedRoute[0].name, resolvedRoute[0].angle)
    if (chartAspects) {
      triggerChartPlanetAspects(resolvedRoute[0].name, { targetOpacity: MAX_ASPECT_LINE_OPACITY, transitionMs: 0 })
    }
    lastPlayedPlanetRef.current = resolvedRoute[0].name

    const animateTransition = (fromAngle: number, toAngle: number, onDone: () => void) => {
      const startMs = performance.now()
      const delta = ((toAngle - fromAngle + 540) % 360) - 180
      const tick = () => {
        if (navigationRunIdRef.current !== runId) return
        const now = performance.now()
        const progress = Math.min(1, (now - startMs) / NAVIGATION_TRANSITION_MS)
        const angle = norm360(fromAngle + delta * progress)
        if (lastUiCommitMs === 0 || now - lastUiCommitMs >= uiCommitIntervalMs) {
          lastUiCommitMs = now
          setPointerAngle(angle, resolvedRoute[Math.min(stepIndex + 1, resolvedRoute.length - 1)]?.name ?? null)
        }
        if (progress >= 1) {
          setPointerAngle(toAngle, resolvedRoute[Math.min(stepIndex + 1, resolvedRoute.length - 1)]?.name ?? null)
          onDone()
          return
        }
        animationFrameIdRef.current = requestAnimationFrame(tick)
      }
      cancelPointerLoop()
      animationFrameIdRef.current = requestAnimationFrame(tick)
    }

    const finishRoute = () => {
      setIsLoopRunning(false)
      setIsPaused(false)
      setCurrentPlanetUnderPointer(null)
      setStartButtonPhase("contracted")
      loopElapsedBeforePauseMsRef.current = 0
      setPointerOpacity(1)
      setPointerOpacityTransitionMs(0)
      setChartAspectsTransitionMs(0)
      if (chartAspects) {
        const key = chartAspectsKeyRef.current
        setActivePlanetAspectsMap((prevMap) => {
          if (!prevMap[key]) return prevMap
          const updated = { ...prevMap }
          delete updated[key]
          return updated
        })
      }
    }

    const computeStepHoldMs = () => {
      if (forceContinuousFade) return 0
      if (holdMs <= 0) return 0
      const useInfraction = Math.random() < infractionProbability
      const jitterRange = useInfraction ? infractionJitterMs : jitterMs
      const randomOffset = jitterRange > 0 ? (Math.random() * 2 - 1) * jitterRange : 0
      const rawHoldMs = Math.max(0, holdMs + randomOffset)
      if (!shrinkHoldForFade) return rawHoldMs
      return Math.max(0, rawHoldMs - transitionFadeDurationMs)
    }

    const teleportTransition = (
      currentStep: { name: string; angle: number },
      nextStep: { name: string; angle: number },
      onDone: () => void,
    ) => {
      if (!teleport) {
        onDone()
        return
      }

      if (halfFadeMs === 0) {
        setPointerOpacity(0)
        if (chartAspects) {
          triggerChartPlanetAspects(currentStep.name, { targetOpacity: 0, transitionMs: 0 })
        }
        setPointerAngle(nextStep.angle, nextStep.name)
        triggerPlanetAudioAtPointer(nextStep.name, nextStep.angle)
        lastPlayedPlanetRef.current = nextStep.name
        if (chartAspects) {
          triggerChartPlanetAspects(nextStep.name, { targetOpacity: MAX_ASPECT_LINE_OPACITY, transitionMs: 0 })
        }
        setPointerOpacity(1)
        onDone()
        return
      }

      setPointerOpacityTransitionMs(halfFadeMs)
      setPointerOpacity(0)
      if (chartAspects) {
        triggerChartPlanetAspects(currentStep.name, { targetOpacity: 0, transitionMs: halfFadeMs })
      }

      const fadeOutTimer = setTimeout(() => {
        if (navigationRunIdRef.current !== runId) return
        setPointerAngle(nextStep.angle, nextStep.name)
        triggerPlanetAudioAtPointer(nextStep.name, nextStep.angle)
        lastPlayedPlanetRef.current = nextStep.name
        if (chartAspects) {
          triggerChartPlanetAspects(nextStep.name, { targetOpacity: 0, transitionMs: 0 })
        }
        setPointerOpacityTransitionMs(fadeInMs)
        setPointerOpacity(1)

        if (chartAspects) {
          const chartFadeInTimer = setTimeout(() => {
            if (navigationRunIdRef.current !== runId) return
            triggerChartPlanetAspects(nextStep.name, { targetOpacity: MAX_ASPECT_LINE_OPACITY, transitionMs: fadeInMs })
          }, 0)
          navigationTimeoutsRef.current.push(chartFadeInTimer)
        }

        const fadeInTimer = setTimeout(() => {
          if (navigationRunIdRef.current !== runId) return
          setPointerOpacityTransitionMs(0)
          onDone()
        }, fadeInMs)
        navigationTimeoutsRef.current.push(fadeInTimer)
      }, halfFadeMs)
      navigationTimeoutsRef.current.push(fadeOutTimer)
    }

    const scheduleNextAdvance = () => {
      if (navigationRunIdRef.current !== runId) return
      const stepHoldMs = computeStepHoldMs()
      const waitBeforeTransitionMs = Math.max(0, stepHoldMs - audioLeadMs)
      navigationStepTimeoutRef.current = setTimeout(advance, waitBeforeTransitionMs)
    }

    const advance = () => {
      if (navigationRunIdRef.current !== runId) return
      const nextIndex = stepIndex + 1
      if (nextIndex >= resolvedRoute.length) {
        finishRoute()
        return
      }

      const currentStep = resolvedRoute[stepIndex]
      const nextStep = resolvedRoute[nextIndex]
      const runStepDone = () => {
        stepIndex = nextIndex
        if (stepIndex >= resolvedRoute.length - 1) {
          const finalHoldMs = computeStepHoldMs()
          if (finalHoldMs > 0) {
            navigationStepTimeoutRef.current = setTimeout(() => {
              if (navigationRunIdRef.current !== runId) return
              finishRoute()
            }, finalHoldMs)
          } else {
            finishRoute()
          }
          return
        }
        scheduleNextAdvance()
      }

      if (!teleport) {
        triggerPlanetAudioAtPointer(nextStep.name, nextStep.angle)
        lastPlayedPlanetRef.current = nextStep.name
      }
      if (chartAspects && !teleport) {
        triggerChartPlanetAspects(nextStep.name, { targetOpacity: MAX_ASPECT_LINE_OPACITY, transitionMs: 100 })
      }

      if (teleport) {
        if (audioLeadMs > 0) {
          const transitionTimer = setTimeout(() => {
            if (navigationRunIdRef.current !== runId) return
            teleportTransition(currentStep, nextStep, runStepDone)
          }, audioLeadMs)
          navigationTimeoutsRef.current.push(transitionTimer)
        } else {
          teleportTransition(currentStep, nextStep, runStepDone)
        }
        return
      }

      if (audioLeadMs > 0) {
        const transitionTimer = setTimeout(() => {
          if (navigationRunIdRef.current !== runId) return
          animateTransition(currentStep.angle, nextStep.angle, runStepDone)
        }, audioLeadMs)
        navigationTimeoutsRef.current.push(transitionTimer)
      } else {
        animateTransition(currentStep.angle, nextStep.angle, runStepDone)
      }
    }

    scheduleNextAdvance()
  }

  const startAstralChordMode = () => {
    if (!horoscopeData?.planets) return
    const runId = navigationRunIdRef.current
    const allowedAspects = new Set(["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"])
    const allMajorAspects =
      horoscopeData.aspects?.filter(
        (aspect) =>
          allowedAspects.has(aspect.aspectType) && aspect.point1.name.toLowerCase() !== aspect.point2.name.toLowerCase(),
      ) || []

    if (allMajorAspects.length > 0) {
      setChordAspectsTransitionMs(CHORD_ASPECTS_FADE_IN_MS)
      setActivePlanetAspectsMap({
        all: {
          aspects: allMajorAspects,
          opacity: 0,
        },
      })
      const chordFadeTimer = setTimeout(() => {
        if (navigationRunIdRef.current !== runId) return
        setActivePlanetAspectsMap((prevMap) => {
          const current = prevMap.all
          if (!current) return prevMap
          return {
            ...prevMap,
            all: {
              aspects: current.aspects,
              opacity: 1,
            },
          }
        })
      }, 40)
      navigationTimeoutsRef.current.push(chordFadeTimer)

      const chordFadeOutTimer = setTimeout(() => {
        if (navigationRunIdRef.current !== runId) return
        setChordAspectsTransitionMs(CHORD_ASPECTS_FADE_OUT_MS)
        setActivePlanetAspectsMap((prevMap) => {
          const current = prevMap.all
          if (!current) return prevMap
          return {
            ...prevMap,
            all: {
              aspects: current.aspects,
              opacity: 0,
            },
          }
        })
      }, CHORD_ASPECTS_FADE_IN_MS + CHORD_ASPECTS_HOLD_MS)
      navigationTimeoutsRef.current.push(chordFadeOutTimer)

      const chordCleanupTimer = setTimeout(() => {
        if (navigationRunIdRef.current !== runId) return
        setActivePlanetAspectsMap((prevMap) => {
          if (!prevMap.all) return prevMap
          const updated = { ...prevMap }
          delete updated.all
          return updated
        })
      }, CHORD_ASPECTS_FADE_IN_MS + CHORD_ASPECTS_HOLD_MS + CHORD_ASPECTS_FADE_OUT_MS + 80)
      navigationTimeoutsRef.current.push(chordCleanupTimer)
    } else {
      setActivePlanetAspectsMap({})
    }

    const route = buildSequentialRoute().filter((name, index, arr) => index === arr.indexOf(name))
    setCurrentPlanetUnderPointer(null)

    route.forEach((planetName, index) => {
      const angle = getPlanetDialAngle(planetName)
      if (angle === null) return
      const timer = setTimeout(() => {
        if (navigationRunIdRef.current !== runId) return
        setCurrentPlanetUnderPointer(planetName)
        triggerPlanetAudioAtPointer(planetName, angle, { aspectsPoint1Only: false, forceChordProfile: true })
      }, index * 20)
      navigationTimeoutsRef.current.push(timer)
    })

    const totalDurationSec = Math.max(audioFadeIn + audioFadeOut, dynAspectsFadeIn + dynAspectsSustain + dynAspectsFadeOut)
    const chordVisualDurationMs = CHORD_ASPECTS_FADE_IN_MS + CHORD_ASPECTS_HOLD_MS + CHORD_ASPECTS_FADE_OUT_MS + 300
    const finishTimer = setTimeout(() => {
      if (navigationRunIdRef.current !== runId) return
      setIsLoopRunning(false)
      setIsPaused(false)
      setCurrentPlanetUnderPointer(null)
      setStartButtonPhase("contracted")
      setActivePlanetAspectsMap({})
      setChordAspectsTransitionMs(CHORD_ASPECTS_FADE_IN_MS)
    }, Math.max(2000, totalDurationSec * 1000 + 300, chordVisualDurationMs))
    navigationTimeoutsRef.current.push(finishTimer)
  }

  const startNavigationMode = (mode: NavigationMode) => {
    if (!horoscopeData) return
    setNavigationMode(mode)
    cancelAllNavigationSchedulers()
    clearAspectTimers()
    stopAll()
    stopBackgroundSound()
    stopElementBackground()
    loopElapsedBeforePauseMsRef.current = 0
    lastUiCommitTimeRef.current = 0
    setPointerOpacity(1)
    setPointerOpacityTransitionMs(0)
    setChartAspectsTransitionMs(0)
    setChordAspectsTransitionMs(CHORD_ASPECTS_FADE_IN_MS)
    setActivePlanetAspectsMap({})
    setIsLoopRunning(true)
    setIsPaused(false)
    setStartButtonPhase("expanding")

    if (startButtonPhaseTimeoutRef.current) {
      clearTimeout(startButtonPhaseTimeoutRef.current)
    }
    startButtonPhaseTimeoutRef.current = setTimeout(() => {
      setStartButtonPhase("stable")
    }, 15000)

    if (mode === "radial") {
      startAmbientBed({ playBackground: true, playElement: true })
      beginPointerLoop(0)
      return
    }
    if (mode === "astral_chord") {
      startAmbientBed({ playBackground: false, playElement: true })
      startAstralChordMode()
      return
    }
    if (mode === "sequential") {
      startAmbientBed({ playBackground: false, playElement: true, elementVolumeOverride: 1 })
      startNonRadialRoute(buildSequentialRoute(), {
        teleport: true,
        holdMs: CHART_PLANET_HOLD_MS,
        crossfadeMs: NON_RADIAL_CROSSFADE_MS,
        chartAspects: true,
        fadeInSpeedMultiplier: 1,
        fadeTransitionMultiplier: NON_RADIAL_FADE_SLOWDOWN_MULTIPLIER,
        shrinkHoldForFade: true,
        forceContinuousFade: true,
        audioLeadMs: 0,
        jitterMs: NON_RADIAL_JITTER_MS,
        infractionProbability: NON_RADIAL_INFRACTION_PROBABILITY,
        infractionJitterMs: NON_RADIAL_INFRACTION_JITTER_MS,
      })
      return
    }
    startAmbientBed({ playBackground: false, playElement: true })
    startNonRadialRoute(buildAspectualRoute(), {
      teleport: true,
      holdMs: CHART_PLANET_HOLD_MS,
      crossfadeMs: NON_RADIAL_CROSSFADE_MS,
      chartAspects: true,
      fadeInSpeedMultiplier: 1,
      fadeTransitionMultiplier: NON_RADIAL_FADE_SLOWDOWN_MULTIPLIER,
      shrinkHoldForFade: true,
      forceContinuousFade: true,
      audioLeadMs: 0,
      jitterMs: NON_RADIAL_JITTER_MS,
      infractionProbability: NON_RADIAL_INFRACTION_PROBABILITY,
      infractionJitterMs: NON_RADIAL_INFRACTION_JITTER_MS,
    })
  }

  const buildOfflineMp3Plan = useCallback(
    (
      mode: NavigationMode,
    ):
      | {
          events: OfflineMp3PlanetEvent[]
          durationSec: number
          includeBackground: boolean
          includeElement: boolean
          elementVolumePercent: number
        }
      | null => {
      if (!horoscopeData?.planets) return null

      const majorAspectTypes = new Set(["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"])
      const getDeclination = (planetName: string): number => {
        const found = horoscopeData.planets.find((planet) => planet.name.toLowerCase() === planetName.toLowerCase())
        return found?.declination || 0
      }

      const getAspectEvents = (planetName: string, aspectsPoint1Only: boolean): OfflineMp3AspectEvent[] => {
        const events: OfflineMp3AspectEvent[] = []
        for (const aspect of horoscopeData.aspects || []) {
          if (!majorAspectTypes.has(aspect.aspectType)) continue

          const point1 = aspect.point1.name.toLowerCase()
          const point2 = aspect.point2.name.toLowerCase()
          const targetName = planetName.toLowerCase()
          const isRelated = point1 === targetName || point2 === targetName
          if (!isRelated) continue
          if (aspectsPoint1Only && point1 !== targetName) continue

          const otherPlanet = point1 === targetName ? point2 : point1
          const otherAngle = getPlanetDialAngle(otherPlanet)
          if (otherAngle === null) continue
          events.push({
            planetName: otherPlanet,
            angleDeg: otherAngle,
            declinationDeg: getDeclination(otherPlanet),
            aspectType: aspect.aspectType,
          })
        }
        return events
      }

      const buildPlanetEvent = (planetName: string, startSec: number): OfflineMp3PlanetEvent | null => {
        const angle = getPlanetDialAngle(planetName)
        if (angle === null) return null
        return {
          planetName,
          angleDeg: angle,
          declinationDeg: getDeclination(planetName),
          startSec,
          fadeInSec: audioFadeIn,
          fadeOutSec: audioFadeOut,
          aspects: getAspectEvents(planetName, false),
          aspectFadeInSec: dynAspectsFadeIn,
          aspectSustainSec: dynAspectsSustain,
          aspectFadeOutSec: dynAspectsFadeOut,
          aspectVolumePercent: aspectsSoundVolume,
        }
      }

      if (mode === "astral_chord") {
        const route = buildSequentialRoute().filter((name, index, arr) => index === arr.indexOf(name))
        const events = route
          .map((planetName, index) => buildPlanetEvent(planetName, index * 0.02))
          .filter((event): event is OfflineMp3PlanetEvent => event !== null)
        if (events.length === 0) return null
        const chordDurationSec = Math.max(audioFadeIn + audioFadeOut, dynAspectsFadeIn + dynAspectsSustain + dynAspectsFadeOut)
        return {
          events,
          durationSec: Math.max(8, chordDurationSec + 3),
          includeBackground: false,
          includeElement: true,
          elementVolumePercent: elementSoundVolume,
        }
      }

      if (mode === "sequential" || mode === "aspectual") {
        const route = mode === "sequential" ? buildSequentialRoute() : buildAspectualRoute()
        if (route.length === 0) return null

        const events: OfflineMp3PlanetEvent[] = []
        let cursorSec = 0
        const firstEvent = buildPlanetEvent(route[0], cursorSec)
        if (firstEvent) events.push(firstEvent)

        for (let i = 1; i < route.length; i++) {
          const useInfraction = Math.random() < NON_RADIAL_INFRACTION_PROBABILITY
          const jitterRangeMs = useInfraction ? NON_RADIAL_INFRACTION_JITTER_MS : NON_RADIAL_JITTER_MS
          const randomOffsetMs = jitterRangeMs > 0 ? (Math.random() * 2 - 1) * jitterRangeMs : 0
          const stepHoldMs = Math.max(0, CHART_PLANET_HOLD_MS + randomOffsetMs)
          cursorSec += stepHoldMs / 1000

          const event = buildPlanetEvent(route[i], cursorSec)
          if (event) events.push(event)
        }

        if (events.length === 0) return null
        const durationSec = cursorSec + CHART_PLANET_HOLD_MS / 1000 + Math.max(audioFadeOut, dynAspectsFadeOut) + 2
        return {
          events,
          durationSec: Math.max(10, durationSec),
          includeBackground: false,
          includeElement: true,
          elementVolumePercent: mode === "sequential" ? 1 : elementSoundVolume,
        }
      }

      const radialEvents = horoscopeData.planets
        .map((planet) => {
          const angle = getPlanetDialAngle(planet.name)
          if (angle === null) return null
          const phase = norm360(angle - 180) / 360
          const startSec = phase * loopDuration
          return buildPlanetEvent(planet.name, startSec)
        })
        .filter((event): event is OfflineMp3PlanetEvent => event !== null)
        .sort((a, b) => a.startSec - b.startSec)

      if (radialEvents.length === 0) return null
      return {
        events: radialEvents,
        durationSec: Math.max(12, loopDuration + Math.max(audioFadeOut, dynAspectsFadeOut) + 2),
        includeBackground: true,
        includeElement: true,
        elementVolumePercent: elementSoundVolume,
      }
    },
    [
      aspectsSoundVolume,
      audioFadeIn,
      audioFadeOut,
      buildAspectualRoute,
      buildSequentialRoute,
      dynAspectsFadeIn,
      dynAspectsFadeOut,
      dynAspectsSustain,
      elementSoundVolume,
      getPlanetDialAngle,
      horoscopeData?.aspects,
      horoscopeData?.planets,
      loopDuration,
    ],
  )

  const buildSubjectMp3FileName = useCallback((): string => {
    const datetime = formData.datetime.trim()
    const datetimeMatch = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
    const yyyymmddhhmm = datetimeMatch
      ? `${datetimeMatch[1]}${datetimeMatch[2]}${datetimeMatch[3]}${datetimeMatch[4]}${datetimeMatch[5]}`
      : "000000000000"

    const locationParts = formData.location
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    const rawCity = locationParts[0] || "CIUDAD"
    const rawCountry = locationParts.length > 1 ? locationParts[locationParts.length - 1] : "PAIS"
    const city = sanitizeFileToken(rawCity, "CIUDAD")
    const country = sanitizeFileToken(rawCountry, "PAIS")
    return `${yyyymmddhhmm}_${city}_${country}.mp3`
  }, [formData.datetime, formData.location])

  const downloadNavigationModeMp3 = useCallback(
    async (mode: NavigationMode) => {
      if (!horoscopeData || isExportingMp3) return
      const plan = buildOfflineMp3Plan(mode)
      if (!plan || plan.events.length === 0) {
        setError("No se pudo generar el plan de exportación MP3.")
        return
      }

      const sunDegrees = horoscopeData.planets.find((planet) => planet.name === "sun")?.ChartPosition?.Ecliptic?.DecimalDegrees
      const sunElement = typeof sunDegrees === "number" ? getElementFromDegrees(sunDegrees) : "fire"
      const exportMasterVolume = mode === "astral_chord" ? masterVolume * 0.6 : masterVolume
      const fileName = buildSubjectMp3FileName()

      setPendingMp3Download((prev) => {
        if (prev?.url) {
          URL.revokeObjectURL(prev.url)
        }
        return null
      })
      setError("")
      setIsExportingMp3(true)
      try {
        let fileHandle: any = null
        let savedViaPicker = false
        const showSaveFilePicker = (window as any).showSaveFilePicker
        if (typeof showSaveFilePicker === "function") {
          try {
            fileHandle = await showSaveFilePicker({
              suggestedName: fileName,
              types: [{ description: "MP3 Audio", accept: { "audio/mpeg": [".mp3"] } }],
            })
          } catch (pickerError: any) {
            if (pickerError?.name === "AbortError") {
              setIsExportingMp3(false)
              return
            }
            console.warn("[v0] showSaveFilePicker unavailable/failed, falling back to auto-download", pickerError)
          }
        }

        const mp3Blob = await renderOfflineMp3({
          events: plan.events,
          durationSec: plan.durationSec,
          masterVolumePercent: exportMasterVolume,
          tuningCents,
          modalEnabled,
          modalSunSignIndex,
          includeBackground: plan.includeBackground,
          backgroundVolumePercent: backgroundVolume,
          includeElement: plan.includeElement,
          elementName: sunElement,
          elementVolumePercent: plan.elementVolumePercent,
          isChordMode: mode === "astral_chord",
          reverbMixPercent: mode === "astral_chord" ? chordReverbMixPercent : reverbMixPercent,
        })
        if (!mp3Blob) {
          setError("No se pudo generar el MP3.")
          setIsExportingMp3(false)
          setPendingMp3Download(null)
          return
        }
        if (mp3Blob.size === 0) {
          setError("MP3 vacío: el render no generó datos de audio.")
          setIsExportingMp3(false)
          setPendingMp3Download(null)
          return
        }

        if (fileHandle) {
          try {
            const writable = await fileHandle.createWritable()
            await writable.write(mp3Blob)
            await writable.close()
            savedViaPicker = true
          } catch (saveError) {
            console.warn("[v0] Save picker write failed, falling back to browser download", saveError)
          }
        }

        const fileUrl = URL.createObjectURL(mp3Blob)
        setPendingMp3Download((prev) => {
          if (prev?.url) {
            URL.revokeObjectURL(prev.url)
          }
          return { url: fileUrl, fileName }
        })

        if (!savedViaPicker) {
          const anchor = document.createElement("a")
          anchor.href = fileUrl
          anchor.download = fileName
          anchor.rel = "noopener"
          anchor.target = "_blank"
          document.body.appendChild(anchor)
          anchor.click()
          document.body.removeChild(anchor)
          setError("Si no se descargó automático por bloqueo del navegador, toca SAVE MP3.")
        } else {
          setError("")
        }
        setNavigationMode(mode)
        setExportMode(mode)
      } catch (error) {
        console.error("[v0] Error exportando MP3 offline:", error)
        setError("Error al exportar MP3.")
        setPendingMp3Download(null)
      } finally {
        setIsExportingMp3(false)
      }
    },
    [
      backgroundVolume,
      buildSubjectMp3FileName,
      buildOfflineMp3Plan,
      horoscopeData,
      isExportingMp3,
      masterVolume,
      modalEnabled,
      modalSunSignIndex,
      chordReverbMixPercent,
      reverbMixPercent,
      renderOfflineMp3,
      tuningCents,
    ],
  )

  const setNavigationModeFromMenu = (mode: NavigationMode) => {
    setNavigationMode(mode)
    setExportMode(mode)
    if (!horoscopeData) return
    if (!isLoopRunning && !isPaused) return
    startNavigationMode(mode)
  }

  const handleEarthCenterPress = () => {
    const mode = navigationMode
    const currentTime = Date.now()
    const isDoubleClick = currentTime - lastClickTimeRef.current < 1000
    lastClickTimeRef.current = currentTime

    if (isDoubleClick) {
      resetToInitialState()
      return
    }

    if (mode === "radial" && navigationMode === "radial" && isLoopRunning && !isPaused) {
      setIsPaused(true)
      cancelPointerLoop()
      loopElapsedBeforePauseMsRef.current = Math.max(0, performance.now() - loopStartTimeRef.current)
      return
    }

    if (mode === "radial" && navigationMode === "radial" && isPaused) {
      setIsPaused(false)
      setIsLoopRunning(true)
      beginPointerLoop(loopElapsedBeforePauseMsRef.current)
      return
    }

    startNavigationMode(mode)
  }

  const handleCalculate = async () => {
    let trimmed = {
      datetime: formData.datetime.trim(),
      location: formData.location.trim(),
      latitude: formData.latitude.trim(),
      longitude: formData.longitude.trim(),
    }

    let payload: SubjectFormData = trimmed
    let presetToUse: "ba" | "cairo" | "manual" | "ba77" = selectedPreset

    if (Object.values(trimmed).every((value) => value === "")) {
      payload = PRESET_BA77_FORM
      presetToUse = "ba77"
      setFormData({ ...PRESET_BA77_FORM })
      setSelectedPreset("ba77")
    } else {
      if (trimmed.location) {
        const resolved = await resolveLocationAndUpdateCoords(trimmed.location)
        if (resolved) {
          const fresh = {
            datetime: trimmed.datetime,
            location: resolved.display,
            latitude: resolved.latitude.toFixed(4),
            longitude: resolved.longitude.toFixed(4),
          }
          trimmed = fresh
          payload = fresh
        }
      }

      const isComplete = Object.values(trimmed).every((value) => value !== "")
      if (!isComplete) {
        setError("Completa todos los datos o deja todo vacío para usar el preset 28/09/1977.")
        return
      }
      payload = trimmed
    }

    const [birthDate, birthTime] = payload.datetime.split("T")
    const latitude = Number.parseFloat(payload.latitude.replace(",", "."))
    const longitude = Number.parseFloat(payload.longitude.replace(",", "."))

    if (!birthDate || !birthTime || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      setError("Formato inválido. Revisa fecha/hora, latitud y longitud.")
      return
    }

    try {
      setError("")
      setLoading(true)
      setShowChart(true)
      cancelAllNavigationSchedulers()
      clearAspectTimers()
      stopAll()
      stopBackgroundSound()
      stopElementBackground()
      loopElapsedBeforePauseMsRef.current = 0
      lastUiCommitTimeRef.current = 0
      setIsLoopRunning(false)
      setIsPaused(false)
      setCurrentPlanetUnderPointer(null)
      setPointerRotation(180)
      setPointerOpacity(1)
      setPointerOpacityTransitionMs(0)
      setChartAspectsTransitionMs(0)
      setChordAspectsTransitionMs(CHORD_ASPECTS_FADE_IN_MS)
      setDebugPointerAngle(0)
      setActivePlanetAspectsMap({})
      console.log("[v0] Calculating with isSidereal:", isSidereal)
      const data = await calculateCustomHoroscope(birthDate, birthTime, latitude, longitude, isSidereal, presetToUse)
      console.log("[v0] Horoscope data received:", data)
      console.log("[v0] Aspects found:", data.aspects?.length || 0, data.aspects)
      if (!data?.planets?.length) {
        throw new Error("Horoscope returned empty planets list")
      }
      setHoroscopeData(data)
      skipNextAutoCalculateRef.current = true
      setShowChart(true)
      setShowSubject(false)
    } catch (err) {
      setError("Error al calcular el horóscopo. Verifica los datos ingresados.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const applyPresetBA = () => {
    setFormData({ ...PRESET_BA_FORM })
    setSelectedPreset("ba")
  }

  const applyPresetCairo = () => {
    setFormData({ ...PRESET_CAIRO_FORM })
    setSelectedPreset("cairo")
  }

  const applyPresetBA77 = () => {
    setFormData({ ...PRESET_BA77_FORM })
    setSelectedPreset("ba77")
  }

  const setManualMode = () => {
    setFormData({ ...EMPTY_SUBJECT_FORM })
    setSelectedPreset("manual")
  }

  const isManualSubjectReady =
    selectedPreset === "manual" &&
    formData.datetime.trim() !== "" &&
    formData.location.trim() !== "" &&
    formData.latitude.trim() !== "" &&
    formData.longitude.trim() !== ""

  const pointerPassFadeMs = useMemo(() => {
    // Pointer hit zone is ±5° (10° total around each glyph).
    const pointerZoneMs = (loopDuration * 1000 * 10) / 360
    return Math.max(220, Math.round(pointerZoneMs / 2))
  }, [loopDuration])

  const pointerSynchronizedGlyphFadeMs = pointerOpacityTransitionMs > 0 ? pointerOpacityTransitionMs : pointerPassFadeMs

  const shouldShowIdlePointer = showPointer && !isLoopRunning && navigationMode === "radial"
  const shouldShowChordCenterPointer = showPointer && isLoopRunning && navigationMode === "astral_chord"
  const shouldShowOrbitPointer =
    showPointer &&
    (isLoopRunning || (!isLoopRunning && (navigationMode === "sequential" || navigationMode === "aspectual")))

  const ascDegrees = horoscopeData?.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0
  const chartRotation = 180 - ascDegrees
  const adjustToCanvasAngle = (lambda: number) => norm360(lambda + chartRotation)

  const { adjustedPositionsArray, adjustedPositions } = useMemo(() => {
    if (!horoscopeData?.planets || horoscopeData.planets.length === 0) {
      return { adjustedPositionsArray: [], adjustedPositions: {} }
    }

    const positions =
      adjustPlanetPositions(
        horoscopeData.planets.map((p) => ({
          name: p.name,
          degrees: p.ChartPosition.Ecliptic.DecimalDegrees,
        })),
      ) || []

    return {
      adjustedPositionsArray: positions,
      adjustedPositions: Object.fromEntries(positions.map((p) => [p.name, p.adjustedDegrees])),
    }
  }, [horoscopeData])

  const getAspectsForPlanet = (planetName: string) => {
    const allowedAspects = ["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"]
    return (
      horoscopeData?.aspects?.filter(
        (aspect) =>
          (aspect.point1.name === planetName || aspect.point2.name === planetName) &&
          allowedAspects.includes(aspect.aspectType),
      ) || []
    )
  }

  const clearInteractivePlanetPreview = useCallback((fadeOut = true) => {
    if (interactivePreviewClearTimeoutRef.current) {
      clearTimeout(interactivePreviewClearTimeoutRef.current)
      interactivePreviewClearTimeoutRef.current = null
    }

    if (!fadeOut) {
      setActivePlanetAspectsMap((prevMap) => {
        if (!prevMap[INTERACTIVE_PREVIEW_KEY]) return prevMap
        const updated = { ...prevMap }
        delete updated[INTERACTIVE_PREVIEW_KEY]
        return updated
      })
      return
    }

    setActivePlanetAspectsMap((prevMap) => {
      const current = prevMap[INTERACTIVE_PREVIEW_KEY]
      if (!current) return prevMap
      return {
        ...prevMap,
        [INTERACTIVE_PREVIEW_KEY]: {
          aspects: current.aspects,
          opacity: 0,
        },
      }
    })

    interactivePreviewClearTimeoutRef.current = setTimeout(() => {
      setActivePlanetAspectsMap((prevMap) => {
        if (!prevMap[INTERACTIVE_PREVIEW_KEY]) return prevMap
        const updated = { ...prevMap }
        delete updated[INTERACTIVE_PREVIEW_KEY]
        return updated
      })
      interactivePreviewClearTimeoutRef.current = null
    }, GLYPH_INTERACTION_FADE_MS)
  }, [])

  const triggerInteractivePlanetPreview = useCallback(
    (planetName: string, adjustedDegrees: number) => {
      const aspectsForPlanet = getAspectsForPlanet(planetName)

      triggerPlanetAudioAtPointer(planetName, adjustedDegrees, {
        forceChordProfile: navigationMode === "astral_chord",
      })

      if (aspectsForPlanet.length === 0) {
        clearInteractivePlanetPreview(false)
        return
      }

      setActivePlanetAspectsMap((prevMap) => ({
        ...prevMap,
        [INTERACTIVE_PREVIEW_KEY]: {
          aspects: aspectsForPlanet,
          opacity: MAX_ASPECT_LINE_OPACITY,
        },
      }))
    },
    [clearInteractivePlanetPreview, getAspectsForPlanet, navigationMode, triggerPlanetAudioAtPointer],
  )

  const triggerChartPlanetAspects = useCallback(
    (planetName: string, options?: { targetOpacity?: number; transitionMs?: number }) => {
      const key = chartAspectsKeyRef.current
      const existingTimers = aspectClickTimersRef.current[key]
      if (existingTimers) {
        existingTimers.forEach((timerId) => clearTimeout(timerId))
      }
      aspectClickTimersRef.current[key] = []

      const targetOpacity = Math.max(0, Math.min(MAX_ASPECT_LINE_OPACITY, options?.targetOpacity ?? MAX_ASPECT_LINE_OPACITY))
      const transitionMs = Math.max(0, options?.transitionMs ?? 0)
      setChartAspectsTransitionMs(transitionMs)

      if (!showDynAspects) {
        setActivePlanetAspectsMap((prevMap) => {
          const updated = { ...prevMap }
          delete updated[key]
          return updated
        })
        return
      }

      const aspectsForPlanet = getAspectsForPlanet(planetName)
      if (aspectsForPlanet.length === 0) {
        setActivePlanetAspectsMap((prevMap) => {
          const updated = { ...prevMap }
          delete updated[key]
          return updated
        })
        return
      }

      setActivePlanetAspectsMap((prevMap) => ({
        ...prevMap,
        [key]: {
          aspects: aspectsForPlanet,
          opacity: targetOpacity,
        },
      }))
    },
    [getAspectsForPlanet, showDynAspects],
  )

  const triggerPlanetGlyphScale = (_planetName: string, _aspectsForPlanet: any[]) => {
    // Dynamic glyph scaling disabled by request.
    return
  }

  const handlePlanetMouseDown = (planetName: string, degrees: number) => {
    setHoveredGlyph(planetName)
    setPressedGlyph(planetName)
    setGlyphHoverOpacity(0)
    triggerPlanetGlyphScale(planetName, getAspectsForPlanet(planetName))
    triggerInteractivePlanetPreview(planetName, degrees)

    if (pressedGlyphReleaseTimeoutRef.current) {
      clearTimeout(pressedGlyphReleaseTimeoutRef.current)
    }
    pressedGlyphReleaseTimeoutRef.current = setTimeout(() => {
      setPressedGlyph((current) => (current === planetName ? null : current))
      clearInteractivePlanetPreview(true)
      pressedGlyphReleaseTimeoutRef.current = null
    }, GLYPH_INTERACTION_FADE_MS + 800)
  }

  const isPlanetUnderPointer = (planetDegrees: number, pointerAngle: number): boolean => {
    if (!showPointer || !isLoopRunning) return false

    // Calculate the difference in angles, considering circular nature
    let angleDiff = Math.abs(planetDegrees - pointerAngle)
    angleDiff = Math.min(angleDiff, 360 - angleDiff)

    // Check if planet is within ±5 degrees of pointer
    return angleDiff <= 5
  }

  // Planet detection is handled inside the active navigation scheduler.

  if (loadingProgress < 100) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="w-full text-center">
              <h1 className="font-mono text-3xl md:text-4xl uppercase tracking-widest text-center">ASTRO.LOG.IO</h1>
              <div className="mt-3 h-[3px] w-full bg-white/20">
                <div
                  className="h-full bg-white"
                  style={{
                    width: `${loadingProgress}%`,
                    transition: "width 0.05s linear",
                  }}
                ></div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between font-mono text-[7px] uppercase tracking-widest text-white/70">
              <span>loading...</span>
              <span>{loadingProgress}%</span>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="relative mb-6 pb-3 border-b border-white flex items-center justify-between min-h-[66px] md:min-h-[84px] md:pr-[620px]">
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="font-mono text-[9px] uppercase tracking-wider border border-white px-3 py-1.5 hover:bg-white hover:text-black transition-colors"
            >
              {menuOpen ? "✕" : "☰"}
            </button>

            {menuOpen && (
              <div className="absolute top-full left-0 mt-2 bg-black border border-white p-3 z-10 min-w-[200px] max-h-[85vh] overflow-y-auto md:scale-[2.3] md:origin-top-left">
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setShowSubject(false)
                      setShowPlanets(false)
                      setShowChart(false)
                      setShowMatrix(false)
                      setShowCircle(false)
                      setShowDegrees(false)
                      setShowAngles(false)
                      setShowAstroChart(false)
                      setShowAspects(false)
                    }}
                    className="w-full text-left font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400 border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors"
                  >
                    Minimal
                  </button>
                  <div className="border-t border-gray-600 my-1"></div>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showSubject}
                      onChange={(e) => setShowSubject(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Subject
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showPlanets}
                      onChange={(e) => setShowPlanets(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Planets
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showAspects}
                      onChange={(e) => setShowAspects(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Aspects
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showDynAspects}
                      onChange={(e) => {
                        setShowDynAspects(e.target.checked)
                        if (!e.target.checked) setDynAspectsOpacity(0)
                      }}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    DynAspects
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showChart}
                      onChange={(e) => setShowChart(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Chart
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showMatrix}
                      onChange={(e) => setShowMatrix(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Matrix
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showCircle}
                      onChange={(e) => setShowCircle(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Circle
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showDegrees}
                      onChange={(e) => setShowDegrees(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Degrees
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showAngles}
                      onChange={(e) => setShowAngles(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Angles
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showAstroChart}
                      onChange={(e) => setShowAstroChart(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    AstroChart
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showPointerInfo}
                      onChange={(e) => setShowPointerInfo(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Pointer Info
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[8.4px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showAspectIndicator}
                      onChange={(e) => setShowAspectIndicator(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Aspect Box
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[8.4px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={modalEnabled}
                      onChange={(e) => setModalEnabled(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Modal
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[8.4px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showVuMeter}
                      onChange={(e) => setShowVuMeter(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    VU
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[8.4px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showModeInfo}
                      onChange={(e) => setShowModeInfo(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Mode Info
                  </label>

                  <div className="border-t border-gray-600 my-1"></div>

                  <div className="space-y-1">
                    <div className="font-mono text-[7.5px] uppercase tracking-wide">Navigation</div>
                    <div className="grid grid-cols-2 gap-1">
                      {(Object.entries(NAV_MODE_HINT_LABEL) as Array<[NavigationMode, string]>).map(([mode, label]) => (
                        <button
                          key={mode}
                          onClick={() => setNavigationModeFromMenu(mode)}
                          className={`font-mono text-[7px] uppercase tracking-wide border px-1 py-0.5 transition-colors ${
                            navigationMode === mode
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white border-gray-600 hover:border-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={resetToInitialState}
                      className="w-full font-mono text-[7px] uppercase tracking-wide border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="border-t border-gray-600 my-1"></div>

                  {/* LOOP Duration Control */}
                  <div className="flex items-center gap-1 py-1 px-2">
                    <div className="font-mono text-[7.5px] uppercase tracking-wide whitespace-nowrap">Loop</div>
                    <button
                      onClick={() => setLoopDuration(Math.max(60, loopDuration - 5))}
                      className="px-1 py-0.5 bg-gray-700 hover:bg-gray-600 text-[6.5px]"
                    >
                      −
                    </button>
                    <span className="text-[7.5px] w-8 text-center">{loopDuration}s</span>
                    <button
                      onClick={() => setLoopDuration(Math.min(300, loopDuration + 5))}
                      className="px-1 py-0.5 bg-gray-700 hover:bg-gray-600 text-[6.5px]"
                    >
                      +
                    </button>
                  </div>

                  <div className="border-t border-gray-600 my-1"></div>

                  <div className="space-y-1">
                    <div className="font-mono text-[7.5px] uppercase tracking-wide">Audio Envelope</div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">Engine</label>
                      <select
                        value={audioEngineMode}
                        onChange={(e) => setAudioEngineMode(e.target.value as AudioEngineMode)}
                        className="bg-black border border-white text-white text-[7px] px-1 py-0.5 w-32 font-mono"
                      >
                        <option value="samples">Samples</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="fm_pad">FM Pad</option>
                        <option value="tibetan_bowls">Tibetan Bowls</option>
                        <option value="tibetan_samples">Tibetan Samples</option>
                      </select>
                      <span className="font-mono text-[6.5px] w-8 text-right uppercase">Mode</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">Fade In</label>
                      <input
                        type="range"
                        min="0"
                        max="15"
                        value={audioFadeIn}
                        onChange={(e) => setAudioFadeIn(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-6 text-right">{audioFadeIn}s</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Fade Out
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="15"
                        value={audioFadeOut}
                        onChange={(e) => setAudioFadeOut(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-6 text-right">{audioFadeOut}s</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">BG Vol</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={backgroundVolume}
                        onChange={(e) => setBackgroundVolume(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-8 text-right">{backgroundVolume}%</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Elemento
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={elementSoundVolume}
                        onChange={(e) => setElementSoundVolume(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-8 text-right">{elementSoundVolume}%</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Aspect Vol
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={aspectsSoundVolume}
                        onChange={(e) => setAspectsSoundVolume(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-8 text-right">{aspectsSoundVolume}%</span>
                    </div>

                    {/* MASTER VOLUME CONTROL */}
                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Master Vol
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={masterVolume}
                        onChange={(e) => setMasterVolume(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-8 text-right">{masterVolume}%</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Reverb
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={reverbMixPercent}
                        onChange={(e) => setReverbMixPercent(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-8 text-right">{reverbMixPercent}%</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Chord RVB
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={chordReverbMixPercent}
                        onChange={(e) => setChordReverbMixPercent(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-8 text-right">{chordReverbMixPercent}%</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Synth Vol
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="600"
                        value={synthVolume}
                        onChange={(e) => setSynthVolume(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-8 text-right">{synthVolume}%</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Tuning
                      </label>
                      <input
                        type="range"
                        min="-1200"
                        max="1200"
                        step="100"
                        value={tuningCents}
                        onChange={(e) => setTuningCents(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-12 text-right">
                        {tuningCents / 100} st
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-gray-600 my-1"></div>

                  <div className="space-y-1">
                    <div className="font-mono text-[7.5px] uppercase tracking-wide">Dynamic Aspects</div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">Fade In</label>
                      <input
                        type="range"
                        min="0"
                        max="15"
                        value={dynAspectsFadeIn}
                        onChange={(e) => setDynAspectsFadeIn(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-6 text-right">{dynAspectsFadeIn}s</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">Sustain</label>
                      <input
                        type="range"
                        min="0"
                        max="15"
                        value={dynAspectsSustain}
                        onChange={(e) => setDynAspectsSustain(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-6 text-right">{dynAspectsSustain}s</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="font-mono text-[7.5px] uppercase tracking-wide w-12 flex-shrink-0">
                        Fade Out
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="15"
                        value={dynAspectsFadeOut}
                        onChange={(e) => setDynAspectsFadeOut(Number(e.target.value))}
                        className="menu-slider flex-none w-32 h-[2px] bg-white rounded cursor-pointer appearance-none"
                      />
                      <span className="font-mono text-[7.5px] w-6 text-right">{dynAspectsFadeOut}s</span>
                    </div>
                  </div>

                  {showVuMeter && (
                    <div className="space-y-1">
                    <div className="font-mono text-[7.5px] uppercase tracking-wide">VU Meter</div>
                    <div className="border border-white/50 bg-black p-1 space-y-1">
                      <div className="flex items-center justify-between text-[6.5px] font-mono uppercase tracking-wide">
                        <span>Pre</span>
                        <span>
                          L {percentToDb(peakLevelLeftPre).toFixed(1)} dB / R {percentToDb(peakLevelRightPre).toFixed(1)} dB
                        </span>
                      </div>
                      <div className="relative h-2 border-b border-white/20 overflow-hidden">
                        <div
                          className="h-full bg-white transition-all duration-75"
                          style={{ width: `${audioLevelLeftPre}%` }}
                        />
                        {peakLevelLeftPre > 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-white/60"
                            style={{ left: `${peakLevelLeftPre}%` }}
                          />
                        )}
                      </div>
                      <div className="relative h-2 overflow-hidden">
                        <div
                          className="h-full bg-white transition-all duration-75"
                          style={{ width: `${audioLevelRightPre}%` }}
                        />
                        {peakLevelRightPre > 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-white/60"
                            style={{ left: `${peakLevelRightPre}%` }}
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[6.5px] font-mono uppercase tracking-wide pt-1">
                        <span>Post</span>
                        <span>
                          L {percentToDb(peakLevelLeftPost).toFixed(1)} dB / R {percentToDb(peakLevelRightPost).toFixed(1)} dB
                        </span>
                      </div>
                      <div className="relative h-2 border-b border-white/20 overflow-hidden">
                        <div
                          className="h-full bg-white transition-all duration-75"
                          style={{ width: `${audioLevelLeftPost}%` }}
                        />
                        {peakLevelLeftPost > 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-white/60"
                            style={{ left: `${peakLevelLeftPost}%` }}
                          />
                        )}
                      </div>
                      <div className="relative h-2 overflow-hidden">
                        <div
                          className="h-full bg-white transition-all duration-75"
                          style={{ width: `${audioLevelRightPost}%` }}
                        />
                        {peakLevelRightPost > 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-white/60"
                            style={{ left: `${peakLevelRightPost}%` }}
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[6.5px] font-mono uppercase tracking-wide pt-1">
                        <span>Comp</span>
                        <span>{compressionReductionDb.toFixed(1)} dB</span>
                      </div>
                      <div className="relative h-2 overflow-hidden border-t border-white/20">
                        <div
                          className="h-full bg-white/70 transition-all duration-75"
                          style={{ width: `${Math.min(100, Math.max(0, (compressionReductionDb / 24) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <h1 className="text-[19px] md:text-[22px] font-mono absolute left-1/2 transform -translate-x-1/2">ASTRO.LOG.IO</h1>
          {showModeInfo && (
            <div className="absolute left-14 md:left-20 top-1/2 -translate-y-1/2 font-mono text-[12px] md:text-[14px] uppercase tracking-widest text-white/85">
              {modalEnabled ? `Modo: ${currentModeLabel}` : "Modo: OFF"}
            </div>
          )}

          {/* START button - Moved to within the chart's rendering logic */}
        </div>

        {showSubject && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                onClick={applyPresetBA}
                className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                  selectedPreset === "ba"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                19740916 BA
              </button>
              <button
                onClick={applyPresetCairo}
                className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                  selectedPreset === "cairo"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                19700101 Cairo
              </button>
              <button
                onClick={applyPresetBA77}
                className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                  selectedPreset === "ba77"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                19770928 BA
              </button>
              <button
                onClick={setManualMode}
                className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                  selectedPreset === "manual"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                Manual
              </button>
            </div>

            {selectedPreset === "manual" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[18px] text-gray-300 mb-1 font-mono">Fecha y Hora</label>
                  <input
                    type="datetime-local"
                    value={formData.datetime}
                    onChange={(e) => setFormData({ ...formData, datetime: e.target.value })}
                    className="w-full bg-black border border-gray-500 text-white p-2 text-[20px] font-mono focus:border-white focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <label className="block text-[18px] text-gray-300 mb-1 font-mono">Lugar</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    onBlur={() => {
                      if (formData.location.trim()) {
                        void resolveLocationAndUpdateCoords(formData.location)
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === "Tab") && formData.location.trim()) {
                        void resolveLocationAndUpdateCoords(formData.location)
                      }
                    }}
                    className="w-full bg-black border border-gray-500 text-white p-2 text-[20px] font-mono focus:border-white focus:outline-none"
                    placeholder="Ciudad o País"
                  />
                  {isResolvingLocation && (
                    <div className="mt-1 text-[12px] font-mono text-white/70">Resolviendo ubicación...</div>
                  )}
                  {locationSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full border border-gray-500 bg-black max-h-44 overflow-y-auto">
                      {locationSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.display}-${index}`}
                          type="button"
                          className="w-full text-left px-2 py-2 text-[15px] font-mono text-white hover:bg-white hover:text-black transition-colors border-b border-gray-700 last:border-b-0"
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              location: suggestion.display,
                              latitude: suggestion.latitude.toFixed(4),
                              longitude: suggestion.longitude.toFixed(4),
                            }))
                            setLocationSuggestions([])
                          }}
                        >
                          {suggestion.display}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[18px] text-gray-300 mb-1 font-mono">Latitud</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    className="w-full bg-black border border-gray-500 text-white p-2 text-[20px] font-mono focus:border-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[18px] text-gray-300 mb-1 font-mono">Longitud</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    className="w-full bg-black border border-gray-500 text-white p-2 text-[20px] font-mono focus:border-white focus:outline-none"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleCalculate}
              disabled={loading}
              className={`block w-full mx-auto bg-white text-black py-2 text-[18px] font-mono text-center hover:bg-gray-200 transition-colors disabled:opacity-50 ${
                isManualSubjectReady ? "send-minimal-ready" : ""
              }`}
            >
              {loading ? "..." : "SEND"}
            </button>
          </div>
        )}

        {horoscopeData && (
          <div className="space-y-8">
            {showChart && (
              <div className="mb-8 flex justify-center" style={{ transform: "translateY(-10px)" }}>
                <div className="relative w-full max-w-[400px] aspect-square md:w-[min(90vh,90vw)] md:h-[min(90vh,90vw)] md:max-w-none md:aspect-auto">
                  <svg viewBox="0 0 400 400" className="w-full h-full scale-90 origin-center">
                    <defs>
                      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                          <feMergeNode in="coloredBlur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {showCircle && (
                      <circle cx="200" cy="200" r="180" fill="none" stroke="white" strokeWidth="1" opacity="0.2" />
                    )}

                    {showMatrix && (
                      <>
                        <line x1="200" y1="20" x2="200" y2="380" stroke="white" strokeWidth="1" opacity="0.15" />
                        <line x1="20" y1="200" x2="380" y2="200" stroke="white" strokeWidth="1" opacity="0.15" />

                        <text
                          x="200"
                          y="12"
                          textAnchor="middle"
                          className="fill-white font-mono text-[8px]"
                          opacity="0.5"
                        >
                          180°
                        </text>
                        <text
                          x="200"
                          y="395"
                          textAnchor="middle"
                          className="fill-white font-mono text-[8px]"
                          opacity="0.5"
                        >
                          0°
                        </text>
                        <text
                          x="8"
                          y="204"
                          textAnchor="start"
                          className="fill-white font-mono text-[8px]"
                          opacity="0.5"
                        >
                          270°
                        </text>
                        <text
                          x="392"
                          y="204"
                          textAnchor="end"
                          className="fill-white font-mono text-[8px]"
                          opacity="0.5"
                        >
                          90°
                        </text>
                      </>
                    )}

                    {horoscopeData.planets.map((planet) => {
                      const originalDegrees = planet.ChartPosition.Ecliptic.DecimalDegrees
                      const adjustedDegrees = adjustedPositions[planet.name] ?? originalDegrees
                      const position = polarToCartesian(200, 200, 180, adjustToCanvasAngle(adjustedDegrees))
                      const glyphSrc = PLANET_GLYPH_SVGS[planet.name]
                      const glyphFallback = PLANET_GLYPH_FALLBACK_LABELS[planet.name] || planet.label
                      // Added hover detection for glyphs
                      const isHovered = hoveredGlyph === planet.name
                      const isPressed = pressedGlyph === planet.name
                      const isPointerFocused = currentPlanetUnderPointer === planet.name
                      const isInteractionActive = isHovered || isPressed || isPointerFocused
                      const interactionScale = isInteractionActive ? GLYPH_INTERACTION_SCALE : 1
                      const glyphInteractionFadeMs = isPointerFocused
                        ? pointerSynchronizedGlyphFadeMs
                        : GLYPH_INTERACTION_FADE_MS
                      const glyphFadeOutDurationMs = glyphInteractionFadeMs + GLYPH_INTERACTION_FADE_OUT_EXTRA_MS
                      const glyphTransition = isInteractionActive
                        ? `transform ${glyphInteractionFadeMs}ms linear, opacity ${glyphInteractionFadeMs}ms linear`
                        : `transform ${glyphFadeOutDurationMs}ms linear -${GLYPH_INTERACTION_FADE_OUT_LEAD_MS}ms, opacity ${glyphFadeOutDurationMs}ms linear -${GLYPH_INTERACTION_FADE_OUT_LEAD_MS}ms`
                      const baseGlyphScale =
                        planet.name === "sun" ? 0.945 : planet.name === "mars" ? 0.69 : planet.name === "venus" ? 0.88 : 1
                      const glyphSize = 20 * baseGlyphScale
                      const glyphGlowTiming = getGlyphGlowTiming(planet.name)
                      const glyphGlowAnimation = `planet-glyph-glow ${glyphGlowTiming.durationSec}s ease-in-out ${glyphGlowTiming.delaySec}s infinite alternate`
                      const glyphBaseFilter =
                        "drop-shadow(0 0 3.2px rgba(255,255,255,0.84)) drop-shadow(0 0 8px rgba(255,255,255,0.44))"
                      const glyphFilter = isHovered ? `url(#glow) ${glyphBaseFilter}` : glyphBaseFilter

                      return (
                        <g
                          key={planet.name}
                          style={{ cursor: "pointer" }}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            handlePlanetMouseDown(planet.name, originalDegrees)
                          }}
                          onPointerEnter={() => {
                            setHoveredGlyph(planet.name)
                            setGlyphHoverOpacity(0)
                            triggerPlanetGlyphScale(planet.name, getAspectsForPlanet(planet.name))
                            triggerInteractivePlanetPreview(planet.name, adjustedDegrees)
                          }}
                          onPointerLeave={() => {
                            setHoveredGlyph((current) => (current === planet.name ? null : current))
                            setGlyphHoverOpacity(0)
                            clearInteractivePlanetPreview(true)
                          }}
                        >
                          <circle
                            cx={position.x}
                            cy={position.y}
                            r={Math.max(12, glyphSize * 0.8)}
                            fill="transparent"
                            style={{ pointerEvents: "all" }}
                          />
                          {glyphSrc ? (
                            <image
                              href={glyphSrc}
                              x={position.x - glyphSize / 2}
                              y={position.y - glyphSize / 2}
                              width={glyphSize}
                              height={glyphSize}
                              preserveAspectRatio="xMidYMid meet"
                              style={{
                                pointerEvents: "none",
                                filter: glyphFilter,
                                animation: glyphGlowAnimation,
                                transformBox: "fill-box",
                                transformOrigin: "center",
                                transform: `scale(${interactionScale})`,
                                opacity: isInteractionActive ? 1 : 0.92,
                                transition: glyphTransition,
                              }}
                            />
                          ) : (
                            <text
                              x={position.x}
                              y={position.y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className={`fill-white font-sans text-xl select-none ${
                                currentPlanetUnderPointer === planet.name ? "fill-white" : ""
                              }`}
                              style={{
                                paintOrder: "stroke fill",
                                stroke: "#ffffff",
                                strokeWidth: "0.5px",
                                transform: `scale(${baseGlyphScale * interactionScale})`,
                                transformOrigin: `${position.x}px ${position.y}px`,
                                opacity: isInteractionActive ? 1 : 0.92,
                                transition: glyphTransition,
                                filter: glyphFilter,
                                animation: glyphGlowAnimation,
                              }}
                            >
                              {glyphFallback}
                            </text>
                          )}
                          {showDegrees && (
                            <text
                              x={position.x}
                              y={position.y + 15}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="fill-white font-mono text-[6px] select-none"
                            >
                              {originalDegrees.toFixed(1)}°
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {showAngles &&
                      horoscopeData.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees !== undefined &&
                      horoscopeData.mc?.ChartPosition?.Ecliptic?.DecimalDegrees !== undefined && (
                        <>
                          {/* ASC */}
                          {(() => {
                            const ascLong = horoscopeData.ascendant.ChartPosition?.Ecliptic?.DecimalDegrees
                            if (ascLong === undefined) return null
                            const theta = adjustToCanvasAngle(ascLong)
                            const innerPos = polarToCartesian(200, 200, 50, theta)
                            const outerPos = polarToCartesian(200, 200, 190, theta)
                            const labelPos = polarToCartesian(200, 200, 175, theta)
                            return (
                              <g>
                                <line
                                  x1={innerPos.x}
                                  y1={innerPos.y}
                                  x2={outerPos.x}
                                  y2={outerPos.y}
                                  stroke="#FFD700"
                                  strokeWidth="2"
                                />
                                <text
                                  x={labelPos.x}
                                  y={labelPos.y}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="#FFD700"
                                  fontSize="12"
                                  fontWeight="bold"
                                >
                                  ASC
                                </text>
                              </g>
                            )
                          })()}
                          {/* MC */}
                          {(() => {
                            const mcLong = horoscopeData.mc.ChartPosition?.Ecliptic?.DecimalDegrees
                            if (mcLong === undefined) return null
                            const theta = adjustToCanvasAngle(mcLong)
                            const innerPos = polarToCartesian(200, 200, 50, theta)
                            const outerPos = polarToCartesian(200, 200, 190, theta)
                            const labelPos = polarToCartesian(200, 200, 175, theta)
                            return (
                              <g>
                                <line
                                  x1={innerPos.x}
                                  y1={innerPos.y}
                                  x2={outerPos.x}
                                  y2={outerPos.y}
                                  stroke="#FFD700"
                                  strokeWidth="2"
                                />
                                <text
                                  x={labelPos.x}
                                  y={labelPos.y}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="#FFD700"
                                  fontSize="12"
                                  fontWeight="bold"
                                >
                                  MC
                                </text>
                              </g>
                            )
                          })()}
                        </>
                      )}

                    {showAspectGraph &&
                      horoscopeData.aspects.map((aspect, index) => {
                        // Get positions for both planets
                        const planet1 = horoscopeData.planets.find((p) => p.name === aspect.point1.name)
                        const planet2 = horoscopeData.planets.find((p) => p.name === aspect.point2.name)

                        // Handle ASC and MC
                        let pos1, pos2

                        if (aspect.point1.name === "asc") {
                          const ascLong = horoscopeData.ascendant.ChartPosition?.Ecliptic?.DecimalDegrees
                          pos1 = polarToCartesian(200, 200, 180, adjustToCanvasAngle(ascLong))
                        } else if (aspect.point1.name === "mc") {
                          const mcLong = horoscopeData.mc.ChartPosition?.Ecliptic?.DecimalDegrees
                          pos1 = polarToCartesian(200, 200, 180, adjustToCanvasAngle(mcLong))
                        } else if (planet1) {
                          const degree =
                            adjustedPositions[planet1.name] ?? planet1.ChartPosition.Ecliptic.DecimalDegrees
                          pos1 = polarToCartesian(200, 200, 180, adjustToCanvasAngle(degree))
                        }

                        if (aspect.point2.name === "asc") {
                          const ascLong = horoscopeData.ascendant.ChartPosition?.Ecliptic?.DecimalDegrees
                          pos2 = polarToCartesian(200, 200, 180, adjustToCanvasAngle(ascLong))
                        } else if (aspect.point2.name === "mc") {
                          const mcLong = horoscopeData.mc.ChartPosition?.Ecliptic?.DecimalDegrees
                          pos2 = polarToCartesian(200, 200, 180, adjustToCanvasAngle(mcLong))
                        } else if (planet2) {
                          const degree =
                            adjustedPositions[planet2.name] ?? planet2.ChartPosition.Ecliptic.DecimalDegrees
                          pos2 = polarToCartesian(200, 200, 180, adjustToCanvasAngle(degree))
                        }

                        if (!pos1 || !pos2) return null
                        const trimmedSegment = trimLineSegment(pos1, pos2, 15, 15)
                        if (!trimmedSegment) return null

                        // Determine color; all aspect lines use 1px width.
                        let stroke = "#888"
                        const strokeWidth = 1
                        if (aspect.aspectType === "Oposición") {
                          stroke = "#FF8C00"
                        } else if (aspect.aspectType === "Conjunción") {
                          stroke = "#9D4EDD"
                        } else if (aspect.aspectType === "Trígono") {
                          stroke = "#00FF00"
                        } else if (aspect.aspectType === "Cuadrado") {
                          stroke = "#FF3B30"
                        } else if (aspect.aspectType === "Sextil") {
                          stroke = "#0099FF"
                        }

                        return (
                          <g key={index} style={{ pointerEvents: "none" }}>
                            <line
                              x1={trimmedSegment.x1}
                              y1={trimmedSegment.y1}
                              x2={trimmedSegment.x2}
                              y2={trimmedSegment.y2}
                              stroke={stroke}
                              strokeWidth={strokeWidth}
                              opacity={MAX_ASPECT_LINE_OPACITY}
                            />
                          </g>
                        )
                      })}

                    {showPointer && (
                      <>
                        {/* Earth center control (single mode trigger) */}
                        <g>
                          <circle
                            cx={EARTH_CENTER_X}
                            cy={EARTH_CENTER_Y}
                            r={EARTH_RADIUS}
                            fill="#0F0F0F"
                            opacity={isLoopRunning ? 1 : 0.92}
                            onPointerDown={handleEarthCenterPress}
                            style={{ cursor: "pointer" }}
                          />
                          <circle
                            cx={EARTH_CENTER_X}
                            cy={EARTH_CENTER_Y}
                            r={EARTH_RADIUS}
                            fill="none"
                            stroke="white"
                            strokeWidth="1.5"
                            opacity={isLoopRunning ? 1 : 0.72}
                            style={{ pointerEvents: "none" }}
                          />
                          <line
                            x1={EARTH_CENTER_X}
                            y1={EARTH_CENTER_Y - EARTH_RADIUS}
                            x2={EARTH_CENTER_X}
                            y2={EARTH_CENTER_Y + EARTH_RADIUS}
                            stroke="white"
                            strokeWidth="1.2"
                            opacity={isLoopRunning ? 1 : 0.72}
                            style={{ pointerEvents: "none" }}
                          />
                          <line
                            x1={EARTH_CENTER_X - EARTH_RADIUS}
                            y1={EARTH_CENTER_Y}
                            x2={EARTH_CENTER_X + EARTH_RADIUS}
                            y2={EARTH_CENTER_Y}
                            stroke="white"
                            strokeWidth="1.2"
                            opacity={isLoopRunning ? 1 : 0.72}
                            style={{ pointerEvents: "none" }}
                          />
                        </g>

                        {/* Animated pointer - rotates clockwise from ASC (180°) */}
                        {shouldShowIdlePointer && (
                          <circle
                            cx="20"
                            cy="200"
                            r="14"
                            fill="white"
                            fillOpacity={ORBIT_POINTER_FILL_OPACITY}
                            stroke="white"
                            strokeWidth="1"
                            opacity="1"
                            style={{ pointerEvents: "none" }}
                          />
                        )}

                        {/* Update pointer visibility - only show when loop is running */}
                        {shouldShowChordCenterPointer && (
                          <circle
                            cx={EARTH_CENTER_X}
                            cy={EARTH_CENTER_Y}
                            r={CHORD_POINTER_RADIUS}
                            fill="white"
                            fillOpacity={CHORD_POINTER_FILL_OPACITY}
                            stroke="white"
                            strokeWidth="1.25"
                            opacity={pointerOpacity}
                            style={{
                              pointerEvents: "none",
                              transition:
                                pointerOpacityTransitionMs > 0
                                  ? `opacity ${pointerOpacityTransitionMs}ms linear`
                                  : "none",
                            }}
                          />
                        )}

                        {shouldShowOrbitPointer && (
                          <g
                            style={{
                              transform: `rotate(${pointerRotation}deg)`,
                              transformOrigin: "200px 200px",
                              transition: "none", // Remove transition for smooth animation
                              opacity: navigationMode === "astral_chord" ? 0 : 1,
                            }}
                          >
                            <circle
                              cx="20"
                              cy="200"
                              r="14"
                              fill="white"
                              fillOpacity={ORBIT_POINTER_FILL_OPACITY}
                              stroke="white"
                              strokeWidth="1"
                              opacity={pointerOpacity}
                              style={{
                                pointerEvents: "none",
                                transition:
                                  pointerOpacityTransitionMs > 0
                                    ? `opacity ${pointerOpacityTransitionMs}ms linear`
                                    : "none",
                              }}
                            />
                          </g>
                        )}
                      </>
                    )}

                    {/* Dynamically display aspects when pointer is over a planet - LINES ALWAYS SHOWN */}
                    {Object.entries(activePlanetAspectsMap).length > 0 &&
                      Object.entries(activePlanetAspectsMap).map(([planetName, data]) =>
                        data.aspects.map((aspect, index) => {
                          // Get positions for both planets involved in the aspect
                          const getPointPosition = (pointName: string) => {
                            let degrees
                            if (pointName === "asc") {
                              degrees = horoscopeData.ascendant.ChartPosition.Ecliptic.DecimalDegrees
                            } else if (pointName === "mc") {
                              degrees = horoscopeData.mc.ChartPosition.Ecliptic.DecimalDegrees
                            } else {
                              const planet = horoscopeData.planets.find((p) => p.name === pointName)
                              if (planet) {
                                // Match the printed glyph position (adjusted), not raw ecliptic angle.
                                degrees = adjustedPositions[planet.name] ?? planet.ChartPosition.Ecliptic.DecimalDegrees
                              }
                            }
                            return degrees !== undefined
                              ? polarToCartesian(200, 200, 180, adjustToCanvasAngle(degrees))
                              : null
                          }

                          const pos1 = getPointPosition(aspect.point1.name)
                          const pos2 = getPointPosition(aspect.point2.name)

                          if (!pos1 || !pos2) return null
                          const trimmedSegment = trimLineSegment(pos1, pos2, 15, 15)
                          if (!trimmedSegment) return null

                          // Determine color; all aspect lines use 1px width.
                          let aspectColor = "#888"
                          const aspectWidth = 1
                          let aspectOpacity = Math.min(data.opacity, MAX_ASPECT_LINE_OPACITY)

                          if (aspect.aspectType === "Oposición") {
                            aspectColor = "#FF8C00"
                          } else if (aspect.aspectType === "Conjunción") {
                            aspectColor = "#9D4EDD"
                          } else if (aspect.aspectType === "Trígono") {
                            aspectColor = "#00FF00"
                          } else if (aspect.aspectType === "Cuadrado") {
                            aspectColor = "#FF3B30"
                          } else if (aspect.aspectType === "Sextil") {
                            aspectColor = "#0099FF"
                          }

                          return (
                            <g key={`aspect-${planetName}-${index}`} style={{ pointerEvents: "none" }}>
                              <line
                                x1={trimmedSegment.x1}
                                y1={trimmedSegment.y1}
                                x2={trimmedSegment.x2}
                                y2={trimmedSegment.y2}
                                stroke={aspectColor}
                                strokeWidth={aspectWidth}
                                style={{
                                  opacity: aspectOpacity,
                                  transition:
                                    planetName === "all"
                                      ? `opacity ${chordAspectsTransitionMs / 1000}s linear`
                                      : planetName === chartAspectsKeyRef.current
                                        ? `opacity ${chartAspectsTransitionMs / 1000}s linear`
                                      : "opacity 0.1s linear",
                                }}
                              />
                            </g>
                          )
                        }),
                      )}
                  </svg>
                  {/* Removed debug pointer angle display */}
                </div>
              </div>
            )}

            {showPlanets && (
              <div className="">
                <div className="bg-white text-black p-3 font-mono flex items-center justify-between">
                  <div>
                    <h2 className="text-[10px] uppercase tracking-wider">Datos Astrológicos</h2>
                    <p className="text-[9px] mt-1 opacity-60">
                      ASC: {horoscopeData.ascendant.sign.label}{" "}
                      {horoscopeData.ascendant.ChartPosition.Ecliptic.ArcDegreesFormatted30}
                    </p>
                  </div>
                  <div className="text-right text-[9px] opacity-60">
                    <div>{formData.location}</div>
                    <div>{new Date(formData.datetime).toLocaleString("es-AR")}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-[9px]">
                    <thead>
                      <tr className="bg-gray-800">
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Glifo
                        </th>
                        <th className="text-right p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Eclíptica (°)
                        </th>
                        <th className="text-left p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Signo
                        </th>
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Casa
                        </th>
                        <th className="text-left p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Posición
                        </th>
                        <th className="text-right p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Horizonte (°)
                        </th>
                        <th className="text-center p-2 font-normal uppercase tracking-wide">Retrógrado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {horoscopeData.planets.map((planet, index) => (
                        <tr key={planet.name} className={index % 2 === 0 ? "bg-black" : "bg-gray-900"}>
                          <td className="p-2 border-r border-gray-700 text-center text-base">
                            {PLANET_GLYPH_SVGS[planet.name] ? (
                              <img
                                src={PLANET_GLYPH_SVGS[planet.name]}
                                alt={planet.label}
                                className="inline-block w-5 h-5 mx-auto align-middle select-none"
                                draggable={false}
                              />
                            ) : (
                              <span
                                style={{
                                  paintOrder: "stroke fill",
                                  WebkitTextStroke: "0.3px white",
                                }}
                              >
                                {PLANET_GLYPH_FALLBACK_LABELS[planet.name] || planet.label}
                              </span>
                            )}
                          </td>
                          <td className="p-2 border-r border-gray-700 text-right tabular-nums">
                            {planet.ChartPosition.Ecliptic.DecimalDegrees.toFixed(4)}
                          </td>
                          <td className="p-2 border-r border-gray-700">{planet.Sign.label}</td>
                          <td className="p-2 border-r border-gray-700 text-center">{planet.House}</td>
                          <td className="p-2 border-r border-gray-700">
                            {planet.ChartPosition.Ecliptic.ArcDegreesFormatted30}
                          </td>
                          <td className="p-2 border-r border-gray-700 text-right tabular-nums">
                            {planet.ChartPosition.Horizon.DecimalDegrees.toFixed(4)}
                          </td>
                          <td className="p-2 text-center">{planet.isRetrograde ? "R" : "—"}</td>
                        </tr>
                      ))}
                      <tr className={horoscopeData.planets.length % 2 === 0 ? "bg-black" : "bg-gray-900"}>
                        <td className="p-2 border-r border-gray-700 text-center text-base">
                          <span
                            style={{
                              paintOrder: "stroke fill",
                              WebkitTextStroke: "0.3px white",
                            }}
                          >
                            ASC
                          </span>
                        </td>
                        <td className="p-2 border-r border-gray-700 text-right tabular-nums">
                          {horoscopeData.ascendant.ChartPosition.Ecliptic.DecimalDegrees.toFixed(4)}
                        </td>
                        <td className="p-2 border-r border-gray-700">{horoscopeData.ascendant.sign.label}</td>
                        <td className="p-2 border-r border-gray-700 text-center">1</td>
                        <td className="p-2 border-r border-gray-700">
                          {horoscopeData.ascendant.ChartPosition.Ecliptic.ArcDegreesFormatted30}
                        </td>
                        <td className="p-2 border-r border-gray-700 text-right tabular-nums">—</td>
                        <td className="p-2 text-center">—</td>
                      </tr>
                      <tr className={(horoscopeData.planets.length + 1) % 2 === 0 ? "bg-black" : "bg-gray-900"}>
                        <td className="p-2 border-r border-gray-700 text-center text-base">
                          <span
                            style={{
                              paintOrder: "stroke fill",
                              WebkitTextStroke: "0.3px white",
                            }}
                          >
                            MC
                          </span>
                        </td>
                        <td className="p-2 border-r border-gray-700 text-right tabular-nums">
                          {horoscopeData.mc.ChartPosition.Ecliptic.DecimalDegrees.toFixed(4)}
                        </td>
                        <td className="p-2 border-r border-gray-700">{horoscopeData.mc.Sign.label}</td>
                        <td className="p-2 border-r border-gray-700 text-center">10</td>
                        <td className="p-2 border-r border-gray-700">
                          {horoscopeData.mc.ChartPosition.Ecliptic.ArcDegreesFormatted30}
                        </td>
                        <td className="p-2 border-r border-gray-700 text-right tabular-nums">—</td>
                        <td className="p-2 text-center">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {showAspects && horoscopeData.aspects.length > 0 && (
              <div className="">
                <div className="bg-white text-black p-3 font-mono flex items-center justify-between">
                  <div>
                    <h2 className="text-[10px] uppercase tracking-wider">Aspectos Astrológicos</h2>
                    <p className="text-[9px] mt-1 opacity-60">Conjunción, Oposición, Trígono, Cuadrado, Sextil</p>
                  </div>
                  <div className="text-right text-[9px] opacity-60">
                    <div>
                      Total:{" "}
                      {
                        horoscopeData.aspects.filter((a) => {
                          const mainPlanets = [
                            "sun",
                            "moon",
                            "mercury",
                            "venus",
                            "mars",
                            "jupiter",
                            "saturn",
                            "uranus",
                            "neptune",
                            "pluto",
                            "asc",
                            "mc",
                          ]
                          return mainPlanets.includes(a.point1.name) && mainPlanets.includes(a.point2.name)
                        }).length
                      }
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-[9px]">
                    <thead>
                      <tr className="bg-gray-800">
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Planeta 1
                        </th>
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Aspecto
                        </th>
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Planeta 2
                        </th>
                        <th className="text-right p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Ángulo (°)
                        </th>
                        <th className="text-right p-2 font-normal uppercase tracking-wide">Orbe (°)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {horoscopeData.aspects
                        .filter((aspect) => {
                          const mainPlanets = [
                            "sun",
                            "moon",
                            "mercury",
                            "venus",
                            "mars",
                            "jupiter",
                            "saturn",
                            "uranus",
                            "neptune",
                            "pluto",
                            "asc",
                            "mc",
                          ]
                          const allowedAspects = ["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"]
                          return (
                            mainPlanets.includes(aspect.point1.name) &&
                            mainPlanets.includes(aspect.point2.name) &&
                            allowedAspects.includes(aspect.aspectType)
                          )
                        })
                        .map((aspect, index) => {
                          // Determine aspect type symbol
                          let aspectSymbol = aspect.aspectType

                          // Map aspect types to symbols only
                          if (aspect.aspectType === "Conjunción") {
                            aspectSymbol = "☌"
                          } else if (aspect.aspectType === "Oposición") {
                            aspectSymbol = "☍"
                          } else if (aspect.aspectType === "Trígono") {
                            aspectSymbol = "△"
                          } else if (aspect.aspectType === "Cuadrado") {
                            aspectSymbol = "▢"
                          } else if (aspect.aspectType === "Sextil") {
                            aspectSymbol = "⚹"
                          }

                          // Check if it's MC or ASC for small font
                          const isSmallFont =
                            aspect.point1.name === "mc" ||
                            aspect.point1.name === "asc" ||
                            aspect.point2.name === "mc" ||
                            aspect.point2.name === "asc"

                          return (
                            <tr key={index} className={index % 2 === 0 ? "bg-black" : "bg-gray-900"}>
                              <td className="p-2 border-r border-gray-700 text-center">
                                {PLANET_GLYPH_SVGS[aspect.point1.name] ? (
                                  <img
                                    src={PLANET_GLYPH_SVGS[aspect.point1.name]}
                                    alt={aspect.point1.label}
                                    className="inline-block w-5 h-5 mx-auto align-middle select-none"
                                    draggable={false}
                                  />
                                ) : (
                                  <span
                                    className={`${isSmallFont && (aspect.point1.name === "mc" || aspect.point1.name === "asc") ? "text-sm" : "text-base"}`}
                                    style={{
                                      paintOrder: "stroke fill",
                                      WebkitTextStroke: "0.3px white",
                                    }}
                                  >
                                    {PLANET_GLYPH_FALLBACK_LABELS[aspect.point1.name] || aspect.point1.label}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 border-r border-gray-700 text-center">
                                <span className="text-lg">{aspectSymbol}</span>
                              </td>
                              <td className="p-2 border-r border-gray-700 text-center">
                                {PLANET_GLYPH_SVGS[aspect.point2.name] ? (
                                  <img
                                    src={PLANET_GLYPH_SVGS[aspect.point2.name]}
                                    alt={aspect.point2.label}
                                    className="inline-block w-5 h-5 mx-auto align-middle select-none"
                                    draggable={false}
                                  />
                                ) : (
                                  <span
                                    className={`${isSmallFont && (aspect.point2.name === "mc" || aspect.point2.name === "asc") ? "text-sm" : "text-base"}`}
                                    style={{
                                      paintOrder: "stroke fill",
                                      WebkitTextStroke: "0.3px white",
                                    }}
                                  >
                                    {PLANET_GLYPH_FALLBACK_LABELS[aspect.point2.name] || aspect.point2.label}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 border-r border-gray-700 text-right tabular-nums">
                                {aspect.angle?.toFixed(2) || "—"}
                              </td>
                              <td className="p-2 text-right tabular-nums">{aspect.orb?.toFixed(2) || "—"}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Aspect Box: Rendered based on showAspectBox state */}
            {showAspectBox && (
              <div
                className="absolute bottom-4 left-4 bg-black/30 backdrop-blur-sm border border-white/20 rounded-lg p-2 max-w-xs"
                style={{ pointerEvents: "auto" }}
              >
                {Object.entries(activePlanetAspectsMap).length > 0 &&
                  Object.entries(activePlanetAspectsMap).map(([planetName, { aspects, opacity }]) => (
                    <div
                      key={`aspects-${planetName}`}
                      style={{
                        opacity: opacity,
                        transition: "opacity 0.1s linear",
                      }}
                    >
                      <h2 className="text-[10px] uppercase tracking-wider mb-1">
                        Aspectos de {planetName.toUpperCase()}
                      </h2>
                      {aspects.map((aspect, index) => {
                        const allowedAspects = ["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"]
                        if (!allowedAspects.includes(aspect.aspectType)) return null

                        let aspectSymbol = aspect.aspectType
                        let aspectColor = "text-white"
                        let brightness = "brightness-75"

                        if (aspect.aspectType === "Oposición") {
                          aspectColor = "text-red-400"
                          brightness = "brightness-100"
                        } else if (aspect.aspectType === "Cuadrado") {
                          aspectColor = "text-violet-400"
                          brightness = "brightness-100"
                        } else if (aspect.aspectType === "Conjunción") {
                          aspectSymbol = "☌"
                          aspectColor = "text-yellow-300"
                        } else if (aspect.aspectType === "Trígono") {
                          aspectSymbol = "△"
                          aspectColor = "text-green-400"
                        } else if (aspect.aspectType === "Sextil") {
                          aspectSymbol = "⚹"
                          aspectColor = "text-blue-400"
                        }

                        return (
                          <div
                            key={`${planetName}-aspect-${index}`}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="inline-flex items-center justify-center min-w-[14px]">
                              {PLANET_GLYPH_SVGS[aspect.point1.name] ? (
                                <img
                                  src={PLANET_GLYPH_SVGS[aspect.point1.name]}
                                  alt={aspect.point1.label}
                                  className="w-3.5 h-3.5 select-none"
                                  draggable={false}
                                />
                              ) : (
                                PLANET_GLYPH_FALLBACK_LABELS[aspect.point1.name] || aspect.point1.label
                              )}
                            </span>
                            <span className={`text-lg ${aspectColor} ${brightness}`}>{aspectSymbol}</span>
                            <span className="inline-flex items-center justify-center min-w-[14px]">
                              {PLANET_GLYPH_SVGS[aspect.point2.name] ? (
                                <img
                                  src={PLANET_GLYPH_SVGS[aspect.point2.name]}
                                  alt={aspect.point2.label}
                                  className="w-3.5 h-3.5 select-none"
                                  draggable={false}
                                />
                              ) : (
                                PLANET_GLYPH_FALLBACK_LABELS[aspect.point2.name] || aspect.point2.label
                              )}
                            </span>
                            <span className="text-gray-400 text-xs">{aspect.angle.toFixed(1)}°</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed top-2 inset-x-0 z-40 pointer-events-none">
        <div className="mx-auto w-full max-w-[calc(1400px+2rem)] md:max-w-[calc(1400px+4rem)] px-4 md:px-8 flex justify-end">
          <div className="pointer-events-auto border border-white/70 bg-black/75 backdrop-blur-sm px-2 py-2 w-full max-w-[560px]">
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.entries(NAV_MODE_HINT_LABEL) as Array<[NavigationMode, string]>).map(([mode, label]) => (
                <button
                  key={`top-nav-${mode}`}
                  onClick={() => setNavigationModeFromMenu(mode)}
                  className={`font-mono text-[12px] uppercase tracking-wide border px-3 py-1.5 transition-colors ${
                    navigationMode === mode
                      ? "bg-white text-black border-white"
                      : "bg-transparent text-white border-gray-600 hover:border-white"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={resetToInitialState}
                className="font-mono text-[12px] uppercase tracking-wide border border-white px-3 py-1.5 hover:bg-white hover:text-black transition-colors"
              >
                RESET
              </button>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <select
                value={exportMode}
                onChange={(e) => setExportMode(e.target.value as NavigationMode)}
                className="flex-1 font-mono text-[11px] uppercase tracking-wide border border-gray-600 bg-black text-white px-2 py-1.5"
              >
                {(Object.entries(NAV_MODE_HINT_LABEL) as Array<[NavigationMode, string]>).map(([mode, label]) => (
                  <option key={`export-${mode}`} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => downloadNavigationModeMp3(exportMode)}
                disabled={!horoscopeData || isExportingMp3}
                className={`font-mono text-[11px] uppercase tracking-wide border px-3 py-1.5 transition-colors ${
                  !horoscopeData || isExportingMp3
                    ? "border-gray-700 text-gray-500 cursor-not-allowed"
                    : "border-white text-white hover:bg-white hover:text-black"
                }`}
              >
                {isExportingMp3 ? "RENDER MP3..." : "DOWNLOAD MP3"}
              </button>
            </div>
            {pendingMp3Download && !isExportingMp3 && (
              <a
                href={pendingMp3Download.url}
                download={pendingMp3Download.fileName}
                className="mt-1.5 block w-full text-center font-mono text-[11px] uppercase tracking-wide border border-white px-3 py-1.5 hover:bg-white hover:text-black transition-colors"
              >
                SAVE MP3
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
