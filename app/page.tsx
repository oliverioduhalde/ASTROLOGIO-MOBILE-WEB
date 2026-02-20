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
  0: "Phrygian Dominant",
  1: "Dorian",
  2: "Lydian",
  3: "Aeolian",
  4: "Ionian",
  5: "Aeolian",
  6: "Ionian",
  7: "Phrygian",
  8: "Mixolydian",
  9: "Harmonic Minor",
  10: "Lydian Dominant",
  11: "Locrian",
}

type AudioEngineMode = "samples" | "fm_pad" | "tibetan_samples"
type InterfaceTheme = "white" | "neon_blue" | "phosphor_green"
type NavigationMode = "astral_chord" | "radial" | "sequential"
type SubjectPreset = "manual" | "here_now" | "ba" | "cairo" | "ba77"
type MajorAspectKey = "conjunction" | "opposition" | "trine" | "square" | "sextile"

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
  radial: "ORBITAL",
  sequential: "CHART",
}
const NAVIGATION_MODES: NavigationMode[] = ["astral_chord", "radial", "sequential"]
const EXPORT_MODE_SUFFIX: Record<NavigationMode, string> = {
  astral_chord: "CHORD",
  radial: "ORBITAL",
  sequential: "CHART",
}
const DOWNLOAD_TOOLTIP_TEXT = "download audio file"
const ENGINE_OPTIONS: Array<{ value: AudioEngineMode; label: string }> = [
  { value: "samples", label: "ASTROLOG SOUNDS" },
  { value: "tibetan_samples", label: "TIBETAN BOWLS" },
  { value: "fm_pad", label: "SYNTH" },
]
const INTERFACE_THEME_OPTIONS: Array<{ value: InterfaceTheme; label: string }> = [
  { value: "white", label: "White" },
  { value: "neon_blue", label: "Neon Blue" },
  { value: "phosphor_green", label: "Phosphor Green" },
]
// Zodiac SVG set sourced from Tabler Icons (MIT).
const ZODIAC_GLYPH_SVGS: Record<string, string> = {
  aries: "/zodiac-glyphs/aries.svg",
  taurus: "/zodiac-glyphs/taurus.svg",
  gemini: "/zodiac-glyphs/gemini.svg",
  cancer: "/zodiac-glyphs/cancer.svg",
  leo: "/zodiac-glyphs/leo.svg",
  virgo: "/zodiac-glyphs/virgo.svg",
  libra: "/zodiac-glyphs/libra.svg",
  scorpio: "/zodiac-glyphs/scorpio.svg",
  sagittarius: "/zodiac-glyphs/sagittarius.svg",
  capricorn: "/zodiac-glyphs/capricorn.svg",
  aquarius: "/zodiac-glyphs/aquarius.svg",
  pisces: "/zodiac-glyphs/pisces.svg",
}
const ZODIAC_SIGN_FALLBACK_ORDER = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
]
const ZODIAC_SIGN_KEY_BY_LABEL: Record<string, string> = {
  aries: "aries",
  tauro: "taurus",
  taurus: "taurus",
  geminis: "gemini",
  gemini: "gemini",
  cancer: "cancer",
  leo: "leo",
  virgo: "virgo",
  libra: "libra",
  escorpio: "scorpio",
  scorpio: "scorpio",
  sagitario: "sagittarius",
  sagittarius: "sagittarius",
  capricornio: "capricorn",
  capricorn: "capricorn",
  acuario: "aquarius",
  aquarius: "aquarius",
  piscis: "pisces",
  pisces: "pisces",
}

const EARTH_CENTER_X = 200
const EARTH_CENTER_Y = 200
const EARTH_RADIUS = 10
const MAX_ASPECT_LINE_OPACITY = 0.7
const INTERACTIVE_PREVIEW_KEY = "__interactive_preview__"
const GLYPH_INTERACTION_SCALE = 1.15
const GLYPH_INTERACTION_FADE_EXTRA_MS = 1000
const GLYPH_INTERACTION_FADE_IN_MS = 500 + GLYPH_INTERACTION_FADE_EXTRA_MS
const GLYPH_INTERACTION_FADE_OUT_MS = 2200 + GLYPH_INTERACTION_FADE_EXTRA_MS + 500
const GLYPH_INTERACTION_FADE_OUT_HOLD_MS = 0
const GLYPH_INTERACTION_PREVIEW_CLEAR_MS = GLYPH_INTERACTION_FADE_OUT_MS + GLYPH_INTERACTION_FADE_OUT_HOLD_MS
const GLYPH_INTERACTION_EASE_IN = "cubic-bezier(0.32, 0.08, 0.24, 1)"
const GLYPH_INTERACTION_EASE_OUT = "cubic-bezier(0.16, 0.84, 0.32, 1)"
const DEFAULT_ASPECTS_SOUND_VOLUME = 11
const ORBIT_POINTER_FILL_OPACITY = 0.1575 // +5%
const CHORD_POINTER_FILL_OPACITY = 0.126 // +5%
const LOADING_SUBTITLE_STEP_MS = 25000
const MONOTYPE_FONT_STACK = '"Roboto Mono", "Courier New", Courier, monospace'
const LOADING_INTRO_PARAGRAPHS = [
  "ASTRO.LOG.IO is a unique immersive audio experience inspired by the Harmony of the Spheres, from ancient cosmology to Kepler’s celestial music, transforming astrological data into sound. Use headphones and explore different dates and places, including the here and now.",
]
const INFO_PARAGRAPHS = [
  "ASTRO.LOG.IO is inspired by the historical idea of the Harmony of the Spheres, from ancient cosmology to Kepler’s vision of celestial music. It translates an astronomically accurate astrological chart into a living, immersive sonic system where planetary motion becomes audible form.",
  "In Chord mode (Astral Chord), the chart is heard as a dense, simultaneous harmonic field.\nIn Orbit mode, listening follows a circular path that moves around the planets in continuous rotation.\nIn Chart mode, the experience becomes a sequential astrological reading, planet by planet.",
  "Each planetary timbre was carefully chosen to express the distinct character traditionally associated with that celestial body. Its spatial placement and tuning emerge from astrological chart coordinates, and interplanetary relationships are organized through astrological criteria.",
  "All rendered audio files can be downloaded and freely distributed, so feel free to experiment with different dates and combinations, including the here & now.\nFor a fully immersive experience, we recommend using headphones.\nEnjoy the spatial energies that surround us all.",
]
const NAV_MODE_INSTRUCTION_BY_MODE: Record<NavigationMode, string> = {
  astral_chord: "Astral Chord: dense, simultaneous harmonic field.",
  radial: "Orbital: continuous circular listening around the planets.",
  sequential: "Chart: sequential astrological reading, planet by planet.",
}

function renderLoadingParagraph(index: number) {
  const paragraph = LOADING_INTRO_PARAGRAPHS[index] ?? ""
  return <>{paragraph}</>
}

const ASPECT_SYMBOL_BY_KEY: Record<MajorAspectKey, string> = {
  conjunction: "☌",
  opposition: "☍",
  trine: "△",
  square: "▢",
  sextile: "⚹",
}

const ASPECT_LABEL_BY_KEY_EN: Record<MajorAspectKey, string> = {
  conjunction: "Conjunction",
  opposition: "Opposition",
  trine: "Trine",
  square: "Square",
  sextile: "Sextile",
}

function normalizeCompareText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function getMajorAspectKey(aspectType: string): MajorAspectKey | null {
  const normalized = normalizeCompareText(aspectType)
  if (!normalized) return null
  if (normalized.includes("conj")) return "conjunction"
  if (normalized.includes("opos") || normalized.includes("oppo")) return "opposition"
  if (normalized.includes("trig") || normalized.includes("trin")) return "trine"
  if (normalized.includes("cuad") || normalized.includes("squar")) return "square"
  if (normalized.includes("sext")) return "sextile"
  return null
}

function isMajorAspectType(aspectType: string): boolean {
  return getMajorAspectKey(aspectType) !== null
}

function getMajorAspectLabel(aspectType: string): string {
  const key = getMajorAspectKey(aspectType)
  return key ? ASPECT_LABEL_BY_KEY_EN[key] : aspectType
}

function getMajorAspectSymbol(aspectType: string): string {
  const key = getMajorAspectKey(aspectType)
  return key ? ASPECT_SYMBOL_BY_KEY[key] : aspectType
}

function getMajorAspectStrokeColor(aspectType: string): string {
  const key = getMajorAspectKey(aspectType)
  if (key === "opposition") return "#FF8C00"
  if (key === "conjunction") return "#9D4EDD"
  if (key === "trine") return "#00FF00"
  if (key === "square") return "#FF3B30"
  if (key === "sextile") return "#0099FF"
  return "#888"
}

function formatDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function sanitizeLocationLabel(rawLocation: string): string {
  const trimmed = rawLocation.trim()
  if (!trimmed) return ""

  const numericTokenPattern = /^[-+]?\d+(\.\d+)?$/
  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !numericTokenPattern.test(part))

  if (parts.length >= 2) return `${parts[0]}, ${parts[parts.length - 1]}`
  if (parts.length === 1) return parts[0]
  return trimmed
}

function titleCaseLocationToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
}

function getCountryFromLocale(): string | null {
  if (typeof navigator === "undefined") return null
  const language = (navigator.language || "").replace("_", "-")
  const region = language.split("-")[1]?.toUpperCase()
  if (!region) return null
  const countryByRegion: Record<string, string> = {
    AR: "Argentina",
    UY: "Uruguay",
    PY: "Paraguay",
    BO: "Bolivia",
    BR: "Brazil",
    CL: "Chile",
    PE: "Peru",
    EC: "Ecuador",
    CO: "Colombia",
    VE: "Venezuela",
    MX: "Mexico",
    US: "United States",
    CA: "Canada",
    ES: "Spain",
    PT: "Portugal",
    FR: "France",
    DE: "Germany",
    IT: "Italy",
    GB: "United Kingdom",
    AU: "Australia",
    NZ: "New Zealand",
  }
  return countryByRegion[region] || null
}

function buildLocationFromTimeZone(): string | null {
  if (typeof Intl === "undefined") return null
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""
  const segments = timeZone.split("/").filter(Boolean)
  if (segments.length < 2) return null

  const city = titleCaseLocationToken(segments[segments.length - 1])
  let country: string | null = null

  if (segments.length >= 3) {
    country = titleCaseLocationToken(segments[segments.length - 2])
  } else {
    country = getCountryFromLocale()
  }

  if (!city) return country
  return country ? `${city}, ${country}` : city
}

function normalizeSignLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

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
  const [showSignsRing, setShowSignsRing] = useState(false)
  const [showHousesRing, setShowHousesRing] = useState(false)
  const [showMatrix, setShowMatrix] = useState(false)
  const [showDegrees, setShowDegrees] = useState(false)
  const [showAngles, setShowAngles] = useState(false)
  const [showAstroChart, setShowAstroChart] = useState(false)
  const [loadingIntroCompleted, setLoadingIntroCompleted] = useState(false)
  const [loadingIntroProgressPct, setLoadingIntroProgressPct] = useState(0)
  const [loadingIntroIndex, setLoadingIntroIndex] = useState(0)
  const [loadingIntroTick, setLoadingIntroTick] = useState(0)
  const [showInfoOverlay, setShowInfoOverlay] = useState(false)
  const [infoParagraphIndex, setInfoParagraphIndex] = useState(0)
  const [peakLevelLeftPre, setPeakLevelLeftPre] = useState(0)
  const [peakLevelRightPre, setPeakLevelRightPre] = useState(0)
  const [peakLevelLeftPost, setPeakLevelLeftPost] = useState(0)
  const [peakLevelRightPost, setPeakLevelRightPost] = useState(0)
  const [showPointer, setShowPointer] = useState(true)
  const [showPointerInfo, setShowPointerInfo] = useState(false)
  const [showVuMeter, setShowVuMeter] = useState(false)
  const [showModeInfo, setShowModeInfo] = useState(false)
  const [advancedMenuEnabled, setAdvancedMenuEnabled] = useState(false)
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("radial")
  const [topPanelHoverKey, setTopPanelHoverKey] = useState<string | null>(null)
  const [isExportingMp3, setIsExportingMp3] = useState(false)
  const [pendingMp3Download, setPendingMp3Download] = useState<{ url: string; fileName: string } | null>(null)
  const [isSidereal, setIsSidereal] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<SubjectPreset>("manual")
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

  const [aspectsSoundVolume, setAspectsSoundVolume] = useState(DEFAULT_ASPECTS_SOUND_VOLUME)
  const [masterVolume, setMasterVolume] = useState(50) // Nuevo estado para controlar volumen maestro (0-100%)
  const [reverbMixPercent, setReverbMixPercent] = useState(20)
  const [chordReverbMixPercent, setChordReverbMixPercent] = useState(40)
  const [tuningCents, setTuningCents] = useState(0)
  const [modalEnabled, setModalEnabled] = useState(true)
  const [audioEngineMode, setAudioEngineMode] = useState<AudioEngineMode>("samples")
  const [interfaceTheme, setInterfaceTheme] = useState<InterfaceTheme>("white")
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
  const loadingIntroIndexRef = useRef(0)
  const loadingIntroElapsedBeforeCurrentMsRef = useRef(0)
  const loadingIntroParagraphStartTimeRef = useRef(0)
  const loadingIntroAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    prepareOrbitalStarBackground,
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

  useEffect(() => {
    if (!horoscopeData?.planets?.length) return
    const sunDegrees = horoscopeData.planets.find((planet) => planet.name === "sun")?.ChartPosition?.Ecliptic?.DecimalDegrees
    const sunSignIndex = typeof sunDegrees === "number" ? Math.floor(norm360(sunDegrees) / 30) % 12 : null
    void prepareOrbitalStarBackground(sunSignIndex, { modalEnabled, force: true })
  }, [horoscopeData, modalEnabled, prepareOrbitalStarBackground])
  const lastPlayedPlanetRef = useRef<string | null>(null)
  const totalLoadingIntroDurationMs = LOADING_INTRO_PARAGRAPHS.length * LOADING_SUBTITLE_STEP_MS
  const showLoadingIntroScreen = loadingProgress < 100 || !loadingIntroCompleted
  const interfaceThemeFilter = useMemo(() => {
    if (interfaceTheme === "neon_blue") {
      return "sepia(1) saturate(8.5) hue-rotate(163deg) brightness(1.04) contrast(1.07)"
    }
    if (interfaceTheme === "phosphor_green") {
      return "sepia(1) saturate(7.8) hue-rotate(66deg) brightness(1.03) contrast(1.08)"
    }
    return "none"
  }, [interfaceTheme])
  const loadingDisplayProgress = useMemo(() => {
    if (!loadingIntroCompleted) return Math.min(99, loadingIntroProgressPct)
    if (loadingProgress >= 100) return 100
    return 99
  }, [loadingIntroCompleted, loadingIntroProgressPct, loadingProgress])

  const clearLoadingIntroAdvanceTimeout = useCallback(() => {
    if (loadingIntroAdvanceTimeoutRef.current) {
      clearTimeout(loadingIntroAdvanceTimeoutRef.current)
      loadingIntroAdvanceTimeoutRef.current = null
    }
  }, [])

  const advanceLoadingIntroParagraph = useCallback(() => {
    const lastParagraphIndex = LOADING_INTRO_PARAGRAPHS.length - 1
    if (loadingIntroIndexRef.current >= lastParagraphIndex) {
      loadingIntroElapsedBeforeCurrentMsRef.current = totalLoadingIntroDurationMs
      loadingIntroParagraphStartTimeRef.current = performance.now()
      setLoadingIntroProgressPct(100)
      setLoadingIntroCompleted(true)
      clearLoadingIntroAdvanceTimeout()
      return
    }

    const nextIndex = loadingIntroIndexRef.current + 1
    loadingIntroIndexRef.current = nextIndex
    loadingIntroElapsedBeforeCurrentMsRef.current = Math.min(totalLoadingIntroDurationMs, nextIndex * LOADING_SUBTITLE_STEP_MS)
    loadingIntroParagraphStartTimeRef.current = performance.now()

    setLoadingIntroCompleted(false)
    setLoadingIntroIndex(nextIndex)
    setLoadingIntroTick((prev) => prev + 1)
    setLoadingIntroProgressPct((loadingIntroElapsedBeforeCurrentMsRef.current / totalLoadingIntroDurationMs) * 100)
  }, [clearLoadingIntroAdvanceTimeout, totalLoadingIntroDurationMs])

  const retreatLoadingIntroParagraph = useCallback(() => {
    if (loadingIntroIndexRef.current <= 0) return

    const prevIndex = loadingIntroIndexRef.current - 1
    loadingIntroIndexRef.current = prevIndex
    loadingIntroElapsedBeforeCurrentMsRef.current = Math.max(0, prevIndex * LOADING_SUBTITLE_STEP_MS)
    loadingIntroParagraphStartTimeRef.current = performance.now()

    setLoadingIntroCompleted(false)
    setLoadingIntroIndex(prevIndex)
    setLoadingIntroTick((prev) => prev + 1)
    setLoadingIntroProgressPct((loadingIntroElapsedBeforeCurrentMsRef.current / totalLoadingIntroDurationMs) * 100)
  }, [totalLoadingIntroDurationMs])

  const openInfoOverlay = useCallback(() => {
    setInfoParagraphIndex(0)
    setShowInfoOverlay(true)
  }, [])

  const closeInfoOverlay = useCallback(() => {
    setShowInfoOverlay(false)
  }, [])

  const advanceInfoParagraph = useCallback(() => {
    setInfoParagraphIndex((prev) => {
      const next = prev + 1
      if (next >= INFO_PARAGRAPHS.length) {
        setShowInfoOverlay(false)
        return 0
      }
      return next
    })
  }, [])

  const retreatInfoParagraph = useCallback(() => {
    setInfoParagraphIndex((prev) => (prev - 1 + INFO_PARAGRAPHS.length) % INFO_PARAGRAPHS.length)
  }, [])

  useEffect(() => {
    if (!showLoadingIntroScreen) return

    loadingIntroIndexRef.current = 0
    loadingIntroElapsedBeforeCurrentMsRef.current = 0
    loadingIntroParagraphStartTimeRef.current = performance.now()

    setLoadingIntroIndex(0)
    setLoadingIntroTick(0)
    setLoadingIntroCompleted(false)
    setLoadingIntroProgressPct(0)

    let animationFrameId: number | null = null
    const updateLoadingTimeline = () => {
      const now = performance.now()
      const elapsedMs =
        loadingIntroElapsedBeforeCurrentMsRef.current + Math.max(0, now - loadingIntroParagraphStartTimeRef.current)
      const boundedElapsedMs = Math.min(totalLoadingIntroDurationMs, elapsedMs)
      const progressPct = (boundedElapsedMs / totalLoadingIntroDurationMs) * 100
      setLoadingIntroProgressPct(progressPct)

      if (boundedElapsedMs >= totalLoadingIntroDurationMs) {
        setLoadingIntroCompleted(true)
        setLoadingIntroProgressPct(100)
        clearLoadingIntroAdvanceTimeout()
        return
      }

      animationFrameId = requestAnimationFrame(updateLoadingTimeline)
    }

    animationFrameId = requestAnimationFrame(updateLoadingTimeline)

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      clearLoadingIntroAdvanceTimeout()
    }
  }, [clearLoadingIntroAdvanceTimeout, showLoadingIntroScreen, totalLoadingIntroDurationMs])

  useEffect(() => {
    if (!showLoadingIntroScreen || loadingIntroCompleted) return

    clearLoadingIntroAdvanceTimeout()
    loadingIntroAdvanceTimeoutRef.current = setTimeout(() => {
      advanceLoadingIntroParagraph()
    }, LOADING_SUBTITLE_STEP_MS)

    return () => {
      clearLoadingIntroAdvanceTimeout()
    }
  }, [advanceLoadingIntroParagraph, clearLoadingIntroAdvanceTimeout, loadingIntroCompleted, loadingIntroIndex, showLoadingIntroScreen])

  useEffect(() => {
    if (!showInfoOverlay) return

    const handleInfoOverlayKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeInfoOverlay()
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        advanceInfoParagraph()
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        retreatInfoParagraph()
      }
    }

    window.addEventListener("keydown", handleInfoOverlayKeyDown)
    return () => {
      window.removeEventListener("keydown", handleInfoOverlayKeyDown)
    }
  }, [advanceInfoParagraph, closeInfoOverlay, retreatInfoParagraph, showInfoOverlay])

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "o" && event.key !== "O") return

      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isEditableTarget =
        !!target && (target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select")
      if (isEditableTarget) return

      event.preventDefault()
      setAdvancedMenuEnabled((prev) => !prev)
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

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
      if (loadingIntroAdvanceTimeoutRef.current) {
        clearTimeout(loadingIntroAdvanceTimeoutRef.current)
        loadingIntroAdvanceTimeoutRef.current = null
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

  const formatSuggestion = (name: string, _admin1: string | undefined, country: string) => {
    return [name, country].filter(Boolean).join(", ")
  }

  const searchLocation = useCallback(async (query: string, count = 6): Promise<GeoSuggestion[]> => {
    const trimmed = query.trim()
    if (!trimmed) return []

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=${count}&language=en&format=json`
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

  const reverseGeocodeLocation = useCallback(async (latitude: number, longitude: number): Promise<string | null> => {
    try {
      const fallbackUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`
      const fallbackResponse = await fetch(fallbackUrl)
      if (fallbackResponse.ok) {
        const fallbackPayload = await fallbackResponse.json()
        const fallbackCity =
          fallbackPayload?.city ||
          fallbackPayload?.locality ||
          fallbackPayload?.principalSubdivision ||
          null
        const fallbackCountry = fallbackPayload?.countryName || null
        if (fallbackCity && fallbackCountry) {
          return formatSuggestion(String(fallbackCity), undefined, String(fallbackCountry))
        }
        if (fallbackCity) {
          return String(fallbackCity)
        }
      }
    } catch {
      // Continue with secondary provider.
    }

    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=en&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
      const nominatimResponse = await fetch(nominatimUrl)
      if (!nominatimResponse.ok) return null
      const nominatimPayload = await nominatimResponse.json()
      const address = nominatimPayload?.address || {}
      const cityCandidate =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        address.state ||
        null
      const countryCandidate = address.country || null
      if (cityCandidate && countryCandidate) {
        return formatSuggestion(String(cityCandidate), undefined, String(countryCandidate))
      }
      if (cityCandidate) {
        return String(cityCandidate)
      }
      if (countryCandidate) {
        return String(countryCandidate)
      }
      return null
    } catch {
      return null
    }
  }, [])

  const getCurrentPosition = useCallback(() => {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (typeof window === "undefined" || !window.navigator?.geolocation) {
        reject(new Error("GeolocationUnavailable"))
        return
      }

      window.navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 120000,
      })
    })
  }, [])

  useEffect(() => {
    if (!showSubject || (selectedPreset !== "manual" && selectedPreset !== "here_now")) return

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
    if ((selectedPreset !== "manual" && selectedPreset !== "here_now") || !showSubject) {
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
            isMajorAspectType(aspect.aspectType) &&
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
        isMajorAspectType(aspect.aspectType),
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
    if (navigationMode === "astral_chord" || navigationMode === "sequential") {
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
    setAspectsSoundVolume(DEFAULT_ASPECTS_SOUND_VOLUME)
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
    setShowSignsRing(false)
    setShowHousesRing(false)
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
      playBackgroundSound({
        sunSignIndex: modalSunSignIndex,
        modalEnabled,
      })
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
    const allMajorAspects =
      horoscopeData.aspects?.filter(
        (aspect) =>
          isMajorAspectType(aspect.aspectType) &&
          aspect.point1.name.toLowerCase() !== aspect.point2.name.toLowerCase(),
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
    startAmbientBed({ playBackground: true, playElement: true })
    beginPointerLoop(0)
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

      const getDeclination = (planetName: string): number => {
        const found = horoscopeData.planets.find((planet) => planet.name.toLowerCase() === planetName.toLowerCase())
        return found?.declination || 0
      }

      const getAspectEvents = (planetName: string, aspectsPoint1Only: boolean): OfflineMp3AspectEvent[] => {
        const events: OfflineMp3AspectEvent[] = []
        for (const aspect of horoscopeData.aspects || []) {
          if (!isMajorAspectType(aspect.aspectType)) continue

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

      if (mode === "sequential") {
        const route = buildSequentialRoute()
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
          elementVolumePercent: 1,
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

  const buildSubjectMp3FileName = useCallback((mode: NavigationMode): string => {
    const datetime = formData.datetime.trim()
    const datetimeMatch = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
    const yyyymmddhhmm = datetimeMatch
      ? `${datetimeMatch[1]}${datetimeMatch[2]}${datetimeMatch[3]}${datetimeMatch[4]}${datetimeMatch[5]}`
      : "000000000000"

    const locationParts = formData.location
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    const rawCity = locationParts[0] || "CITY"
    const rawCountry = locationParts.length > 1 ? locationParts[locationParts.length - 1] : "COUNTRY"
    const city = sanitizeFileToken(rawCity, "CITY")
    const country = sanitizeFileToken(rawCountry, "COUNTRY")
    const modeSuffix = EXPORT_MODE_SUFFIX[mode]
    return `ASTRO.LOG.IO_${yyyymmddhhmm}_${city}_${country}_${modeSuffix}.mp3`
  }, [formData.datetime, formData.location])

  const downloadNavigationModeMp3 = useCallback(
    async (mode: NavigationMode) => {
      if (!horoscopeData || isExportingMp3) return
      const plan = buildOfflineMp3Plan(mode)
      if (!plan || plan.events.length === 0) {
        setError("Could not build the MP3 export plan.")
        return
      }

      const sunDegrees = horoscopeData.planets.find((planet) => planet.name === "sun")?.ChartPosition?.Ecliptic?.DecimalDegrees
      const sunElement = typeof sunDegrees === "number" ? getElementFromDegrees(sunDegrees) : "fire"
      const exportMasterVolume = mode === "astral_chord" ? masterVolume * 0.6 : masterVolume
      const fileName = buildSubjectMp3FileName(mode)

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
          setError("Could not render the MP3 file.")
          setIsExportingMp3(false)
          setPendingMp3Download(null)
          return
        }
        if (mp3Blob.size === 0) {
          setError("Empty MP3: audio render produced no data.")
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
          setError("If browser auto-download is blocked, press SAVE MP3.")
        } else {
          setError("")
        }
        setNavigationMode(mode)
      } catch (error) {
        console.error("[v0] Offline MP3 export error:", error)
        setError("MP3 export failed.")
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

  const handlePlaybackTogglePress = () => {
    const mode = navigationMode

    if (mode === "radial" && isLoopRunning && !isPaused) {
      setIsPaused(true)
      cancelPointerLoop()
      loopElapsedBeforePauseMsRef.current = Math.max(0, performance.now() - loopStartTimeRef.current)
      return
    }

    if (mode === "radial" && isPaused) {
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
    let presetToUse: SubjectPreset = selectedPreset

    if (Object.values(trimmed).every((value) => value === "")) {
      payload = PRESET_BA77_FORM
      presetToUse = "ba77"
      setFormData({ ...PRESET_BA77_FORM })
      setSelectedPreset("manual")
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
        setError("Complete all fields, or leave all fields empty to load the 28/09/1977 preset.")
        return
      }
      payload = trimmed
    }

    const [birthDate, birthTime] = payload.datetime.split("T")
    const latitude = Number.parseFloat(payload.latitude.replace(",", "."))
    const longitude = Number.parseFloat(payload.longitude.replace(",", "."))

    if (!birthDate || !birthTime || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      setError("Invalid format. Check date/time, latitude and longitude.")
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
      setError("Could not calculate the astrological chart. Check the entered data.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const setManualMode = () => {
    setFormData({ ...EMPTY_SUBJECT_FORM })
    setSelectedPreset("manual")
    setError("")
  }

  const applyHereAndNow = async () => {
    const now = new Date()
    const nowDateTime = formatDateTimeLocalValue(now)

    setError("")
    setSelectedPreset("here_now")
    setFormData({
      datetime: nowDateTime,
      location: "",
      latitude: "",
      longitude: "",
    })

    try {
      const position = await getCurrentPosition()
      const latitude = position.coords.latitude
      const longitude = position.coords.longitude
      const resolvedLocation = await reverseGeocodeLocation(latitude, longitude)
      const timezoneFallbackLocation = buildLocationFromTimeZone()
      const locationLabel = sanitizeLocationLabel(
        resolvedLocation || timezoneFallbackLocation || `Current location ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
      )

      setFormData({
        datetime: nowDateTime,
        location: locationLabel,
        latitude: latitude.toFixed(4),
        longitude: longitude.toFixed(4),
      })

      if (!resolvedLocation) {
        setError("City lookup was unavailable. A local fallback label was loaded; edit manually if needed.")
      }
    } catch (geoError: any) {
      const denied = geoError?.code === 1
      setSelectedPreset("manual")
      setFormData({
        datetime: nowDateTime,
        location: "",
        latitude: "",
        longitude: "",
      })
      setError(
        denied
          ? "Geolocation permission was denied. Please enter location manually."
          : "Geolocation is unavailable. Please enter location manually.",
      )
    }
  }

  const isManualSubjectReady =
    (selectedPreset === "manual" || selectedPreset === "here_now") &&
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
    (isLoopRunning || (!isLoopRunning && navigationMode === "sequential"))
  const isPlaybackActive = isLoopRunning && !isPaused

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

  const zodiacRingItems = useMemo(() => {
    const cusps = horoscopeData?.zodiacCusps
    if (!cusps || cusps.length === 0) {
      return ZODIAC_SIGN_FALLBACK_ORDER.map((signKey, idx) => ({
        signKey,
        label: signKey.toUpperCase(),
        centerDegrees: norm360(idx * 30 + 15),
      }))
    }

    const sortedCusps = [...cusps]
      .map((cusp) => ({
        label: cusp.Sign?.label || "",
        startDegrees: cusp.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0,
      }))
      .sort((a, b) => a.startDegrees - b.startDegrees)

    return sortedCusps.map((cusp) => {
      const normalizedLabel = normalizeSignLabel(cusp.label)
      const signKey = ZODIAC_SIGN_KEY_BY_LABEL[normalizedLabel] || normalizedLabel
      return {
        signKey,
        label: cusp.label || signKey.toUpperCase(),
        centerDegrees: norm360(cusp.startDegrees + 15),
      }
    })
  }, [horoscopeData?.zodiacCusps])

  const houseRingItems = useMemo(() => {
    const houses = horoscopeData?.houses
    if (!houses || houses.length === 0) return []

    const sortedHouses = [...houses]
      .map((house) => ({
        id: house.id,
        startDegrees: house.ChartPosition?.StartPosition?.Ecliptic?.DecimalDegrees ?? 0,
      }))
      .sort((a, b) => a.startDegrees - b.startDegrees)

    return sortedHouses.map((house, index) => {
      const nextHouse = sortedHouses[(index + 1) % sortedHouses.length]
      const arcSpan = norm360(nextHouse.startDegrees - house.startDegrees)
      return {
        id: house.id,
        startDegrees: house.startDegrees,
        centerDegrees: norm360(house.startDegrees + arcSpan / 2),
      }
    })
  }, [horoscopeData?.houses])

  const getAspectsForPlanet = (planetName: string) => {
    return (
      horoscopeData?.aspects?.filter(
        (aspect) =>
          (aspect.point1.name === planetName || aspect.point2.name === planetName) && isMajorAspectType(aspect.aspectType),
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
    }, GLYPH_INTERACTION_PREVIEW_CLEAR_MS)
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
    }, GLYPH_INTERACTION_FADE_IN_MS + 800)
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

  if (showLoadingIntroScreen) {
    const isFirstIntroParagraph = loadingIntroIndex <= 0
    const isLastIntroParagraph = loadingIntroIndex >= LOADING_INTRO_PARAGRAPHS.length - 1

    return (
      <main
        className="min-h-screen bg-black text-white flex items-start justify-center p-4 pt-8 md:pt-10 relative"
        style={{ filter: interfaceThemeFilter }}
      >
        <div className="w-full max-w-3xl">
          <div className="mb-8 min-h-[420px]">
            <div className="w-full text-center pt-1">
              <h1 className="font-mono text-3xl md:text-4xl uppercase tracking-widest text-center">
                ASTRO.LOG.IO
              </h1>
              <div className="mt-2 h-[3px] w-full bg-white/20">
                <div
                  className="h-full bg-white"
                  style={{
                    width: `${loadingDisplayProgress}%`,
                    transition: "width 0.05s linear",
                  }}
                ></div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end text-[8px] uppercase tracking-[0.25em] text-white/50">
              <span>{Math.round(loadingDisplayProgress)}%</span>
            </div>

            <div className="mt-5 relative min-h-[500px] md:min-h-[560px] overflow-visible">
              <div className="mx-auto max-w-[980px] px-2 pt-10 pb-8 flex flex-col items-start gap-7">
                <p
                  key={`loading-current-${loadingIntroTick}-${loadingIntroIndex}`}
                  onClick={advanceLoadingIntroParagraph}
                  className="loading-intro-fade-in font-mono cursor-pointer text-[22px] md:text-[26px] leading-[1.36]"
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    textAlign: "left",
                    whiteSpace: "pre-line",
                  }}
                >
                  {renderLoadingParagraph(loadingIntroIndex)}
                </p>
                <div className="mt-8 w-full flex items-center justify-between">
                  <button
                    onClick={retreatLoadingIntroParagraph}
                    disabled={isFirstIntroParagraph}
                    className={`font-mono text-[20px] md:text-[24px] leading-none transition-colors px-2 py-1 ${
                      isFirstIntroParagraph
                        ? "text-white/30 cursor-not-allowed"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    {"<"}
                  </button>
                  <button
                    onClick={advanceLoadingIntroParagraph}
                    className="play-idle-pulse font-mono text-[20px] md:text-[24px] leading-none text-white/50 hover:text-white transition-colors px-2 py-1"
                  >
                    {isLastIntroParagraph ? ">" : ">"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8" style={{ filter: interfaceThemeFilter }}>
      <div className="max-w-[1400px] mx-auto">
        <div className="relative mb-6 pb-3 border-b border-white flex items-center justify-between min-h-[66px] md:min-h-[84px] md:pr-[620px]">
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-14 h-14 flex items-center justify-center font-mono text-[22px] uppercase tracking-wider border border-white hover:bg-white hover:text-black transition-colors"
            >
              {menuOpen ? "✕" : "☰"}
            </button>

            {menuOpen && (
              <div className="absolute top-full left-0 mt-2 bg-black border border-white p-3 z-10 min-w-[200px] max-h-[85vh] overflow-y-auto md:scale-[2.3] md:origin-top-left">
                <div className="mb-2 flex items-center justify-between font-mono text-[7px] uppercase tracking-wide text-white/80">
                  <span>Menu</span>
                  <span>Advanced {advancedMenuEnabled ? "ON" : "OFF"} [O]</span>
                </div>

                <div className={advancedMenuEnabled ? "hidden" : "space-y-2"}>
                  <div className="grid grid-cols-2 gap-1">
                    <label className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wide cursor-pointer border border-white/60 px-1.5 py-1">
                      <input
                        type="checkbox"
                        checked={showSubject}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setShowSubject(checked)
                          if (checked) {
                            setMenuOpen(false)
                          }
                        }}
                        className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                      />
                      Subject
                    </label>
                    <label className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wide cursor-pointer border border-white/60 px-1.5 py-1">
                      <input
                        type="checkbox"
                        checked={showSignsRing}
                        onChange={(e) => setShowSignsRing(e.target.checked)}
                        className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                      />
                      Signs
                    </label>
                    <label className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wide cursor-pointer border border-white/60 px-1.5 py-1">
                      <input
                        type="checkbox"
                        checked={showHousesRing}
                        onChange={(e) => setShowHousesRing(e.target.checked)}
                        className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                      />
                      Houses
                    </label>
                    <label className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wide cursor-pointer border border-white/60 px-1.5 py-1">
                      <input
                        type="checkbox"
                        checked={showAngles}
                        onChange={(e) => setShowAngles(e.target.checked)}
                        className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                      />
                      MC
                    </label>
                  </div>

                  <div className="border-t border-gray-600 my-1"></div>

                  <div className="grid grid-cols-2 gap-1">
                    {NAVIGATION_MODES.map((mode) => (
                      <button
                        key={`minimal-nav-${mode}`}
                        title={NAV_MODE_INSTRUCTION_BY_MODE[mode]}
                        onClick={() => setNavigationModeFromMenu(mode)}
                        className={`font-mono text-[8px] uppercase tracking-wide border px-1 py-1 transition-colors ${
                          navigationMode === mode
                            ? "bg-white text-black border-white"
                            : "bg-transparent text-white border-gray-600 hover:border-white"
                        }`}
                      >
                        {NAV_MODE_HINT_LABEL[mode]}
                      </button>
                    ))}
                    <button
                      onClick={resetToInitialState}
                      className="font-mono text-[8px] uppercase tracking-wide border border-white px-1 py-1 hover:bg-white hover:text-black transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      openInfoOverlay()
                    }}
                    className="mt-1 w-full font-mono text-[8px] uppercase tracking-wide border border-white px-1 py-1 hover:bg-white hover:text-black transition-colors"
                  >
                    Info
                  </button>

                  <div className="border-t border-gray-600 my-1"></div>

                  <div className="flex items-center gap-1">
                    <label className="font-mono text-[10px] uppercase tracking-wide w-16 flex-shrink-0">Engine</label>
                    <select
                      value={audioEngineMode}
                      onChange={(e) => setAudioEngineMode(e.target.value as AudioEngineMode)}
                      className="bg-black border border-white text-white text-[10px] px-1.5 py-1 flex-1 font-mono"
                    >
                      {ENGINE_OPTIONS.map((option) => (
                        <option key={`minimal-engine-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border-t border-gray-600 my-1"></div>

                  <div className="space-y-1">
                    <div className="font-mono text-[10px] uppercase tracking-wide">Interface</div>
                    <div className="grid grid-cols-1 gap-1">
                      {INTERFACE_THEME_OPTIONS.map((option) => (
                        <button
                          key={`minimal-interface-${option.value}`}
                          onClick={() => setInterfaceTheme(option.value)}
                          className={`font-mono text-[10px] border px-1.5 py-1 transition-colors ${
                            interfaceTheme === option.value
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white border-gray-600 hover:border-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={advancedMenuEnabled ? "space-y-1" : "hidden"}>
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
                      onChange={(e) => {
                        const checked = e.target.checked
                        setShowSubject(checked)
                        if (checked) {
                          setMenuOpen(false)
                        }
                      }}
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
                      checked={showSignsRing}
                      onChange={(e) => setShowSignsRing(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Signs Ring
                  </label>
                  <label className="flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-wide cursor-pointer hover:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showHousesRing}
                      onChange={(e) => setShowHousesRing(e.target.checked)}
                      className="w-3 h-3 appearance-none border border-white checked:bg-white checked:border-white cursor-pointer"
                    />
                    Houses Ring
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
                    MC
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
                    <div className="font-mono text-[8.4px] uppercase tracking-wide">Interface</div>
                    <div className="grid grid-cols-1 gap-1">
                      {INTERFACE_THEME_OPTIONS.map((option) => (
                        <button
                          key={`advanced-interface-${option.value}`}
                          onClick={() => setInterfaceTheme(option.value)}
                          className={`font-mono text-[8.5px] border px-1.5 py-1 transition-colors ${
                            interfaceTheme === option.value
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white border-gray-600 hover:border-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-gray-600 my-1"></div>

                  <div className="space-y-1">
                    <div className="font-mono text-[7.5px] uppercase tracking-wide">Navigation</div>
                    <div className="grid grid-cols-2 gap-1">
                      {NAVIGATION_MODES.map((mode) => (
                        <button
                          key={mode}
                          title={NAV_MODE_INSTRUCTION_BY_MODE[mode]}
                          onClick={() => setNavigationModeFromMenu(mode)}
                          className={`font-mono text-[7px] uppercase tracking-wide border px-1 py-0.5 transition-colors ${
                            navigationMode === mode
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white border-gray-600 hover:border-white"
                          }`}
                        >
                          {NAV_MODE_HINT_LABEL[mode]}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={resetToInitialState}
                      className="w-full font-mono text-[7px] uppercase tracking-wide border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        openInfoOverlay()
                      }}
                      className="w-full font-mono text-[7px] uppercase tracking-wide border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors"
                    >
                      Info
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
                      <label className="font-mono text-[9px] uppercase tracking-wide w-16 flex-shrink-0">Engine</label>
                      <select
                        value={audioEngineMode}
                        onChange={(e) => setAudioEngineMode(e.target.value as AudioEngineMode)}
                        className="bg-black border border-white text-white text-[9px] px-1.5 py-1 w-36 font-mono"
                      >
                        {ENGINE_OPTIONS.map((option) => (
                          <option key={`advanced-engine-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="font-mono text-[8px] w-8 text-right uppercase">Mode</span>
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
                        Element
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

          <h1 className="text-[23px] md:text-[26px] font-mono absolute left-1/2 transform -translate-x-1/2">ASTRO.LOG.IO</h1>
          {showModeInfo && (
            <div className="absolute left-14 md:left-20 top-1/2 -translate-y-1/2 font-mono text-[12px] md:text-[14px] uppercase tracking-widest text-white/85">
              {modalEnabled ? `Mode: ${currentModeLabel}` : "Mode: OFF"}
            </div>
          )}

          {/* START button - Moved to within the chart's rendering logic */}
        </div>

        {showSubject && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                onClick={setManualMode}
                className={`px-5 py-2 text-[18px] font-mono border transition-colors ${
                  selectedPreset === "manual"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                MANUAL
              </button>
              <button
                onClick={() => {
                  void applyHereAndNow()
                }}
                className={`px-5 py-2 text-[18px] font-mono border transition-colors ${
                  selectedPreset === "here_now"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                HERE &amp; NOW
              </button>
            </div>

            {(selectedPreset === "manual" || selectedPreset === "here_now") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[18px] text-gray-300 mb-1 font-mono">Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={formData.datetime}
                    onChange={(e) => setFormData({ ...formData, datetime: e.target.value })}
                    className="w-full bg-black border border-gray-500 text-white p-2 text-[20px] font-mono focus:border-white focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <label className="block text-[18px] text-gray-300 mb-1 font-mono">Location</label>
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
                    placeholder="City, Country"
                  />
                  {isResolvingLocation && (
                    <div className="mt-1 text-[12px] font-mono text-white/70">Resolving location...</div>
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
                  <label className="block text-[18px] text-gray-300 mb-1 font-mono">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    className="w-full bg-black border border-gray-500 text-white p-2 text-[20px] font-mono focus:border-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[18px] text-gray-300 mb-1 font-mono">Longitude</label>
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
              className={`mt-8 block w-full mx-auto bg-white text-black py-2 text-[18px] font-mono text-center hover:bg-gray-200 transition-colors disabled:opacity-50 ${
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
                      <filter id="glyph-halo-only" x="-200%" y="-200%" width="400%" height="400%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="1.8" result="halo-blur" />
                        <feComposite in="halo-blur" in2="SourceAlpha" operator="out" result="halo-shell" />
                        <feFlood floodColor="#ffffff" floodOpacity="1" result="halo-color" />
                        <feComposite in="halo-color" in2="halo-shell" operator="in" result="halo-only" />
                        <feMerge>
                          <feMergeNode in="halo-only" />
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

                    {showSignsRing && (
                      <>
                        <circle cx="200" cy="200" r="146" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
                        {zodiacRingItems.map((sign, index) => {
                          const signPosition = polarToCartesian(200, 200, 160, adjustToCanvasAngle(sign.centerDegrees))
                          const signGlyphSrc = ZODIAC_GLYPH_SVGS[sign.signKey]
                          return (
                            <g key={`sign-ring-${sign.signKey}-${index}`} style={{ pointerEvents: "none" }}>
                              {signGlyphSrc ? (
                                <image
                                  href={signGlyphSrc}
                                  x={signPosition.x - 7}
                                  y={signPosition.y - 7}
                                  width={14}
                                  height={14}
                                  preserveAspectRatio="xMidYMid meet"
                                  opacity={0.3}
                                />
                              ) : (
                                <text
                                  x={signPosition.x}
                                  y={signPosition.y}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  className="fill-white text-[7px]"
                                  style={{ opacity: 0.3, fontFamily: MONOTYPE_FONT_STACK }}
                                >
                                  {sign.label.slice(0, 3).toUpperCase()}
                                </text>
                              )}
                            </g>
                          )
                        })}
                      </>
                    )}

                    {showHousesRing && (
                      <>
                        <circle cx="200" cy="200" r="114" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
                        {houseRingItems.map((house) => {
                          const cuspStart = polarToCartesian(200, 200, 124, adjustToCanvasAngle(house.startDegrees))
                          const cuspEnd = polarToCartesian(200, 200, 100, adjustToCanvasAngle(house.startDegrees))
                          const houseLabelPos = polarToCartesian(200, 200, 128, adjustToCanvasAngle(house.centerDegrees))

                          return (
                            <g key={`house-ring-${house.id}`} style={{ pointerEvents: "none" }}>
                              <line
                                x1={cuspStart.x}
                                y1={cuspStart.y}
                                x2={cuspEnd.x}
                                y2={cuspEnd.y}
                                stroke="white"
                                strokeWidth="0.75"
                                opacity="0.3"
                              />
                              <text
                                x={houseLabelPos.x}
                                y={houseLabelPos.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="fill-white text-[8px]"
                                style={{ opacity: 0.3, fontFamily: MONOTYPE_FONT_STACK }}
                              >
                                {house.id}
                              </text>
                            </g>
                          )
                        })}
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
                      const pointerDrivenFadeInMs = Math.max(
                        320,
                        Math.round(pointerSynchronizedGlyphFadeMs * 0.85),
                      ) + GLYPH_INTERACTION_FADE_EXTRA_MS
                      const glyphFadeInMs = isPointerFocused ? pointerDrivenFadeInMs : GLYPH_INTERACTION_FADE_IN_MS
                      const glyphFadeOutMs = GLYPH_INTERACTION_FADE_OUT_MS
                      const glyphTransition = isInteractionActive
                        ? `transform ${glyphFadeInMs}ms ${GLYPH_INTERACTION_EASE_IN} 0ms, opacity ${glyphFadeInMs}ms ${GLYPH_INTERACTION_EASE_IN} 0ms`
                        : `transform ${glyphFadeOutMs}ms ${GLYPH_INTERACTION_EASE_OUT} ${GLYPH_INTERACTION_FADE_OUT_HOLD_MS}ms, opacity ${glyphFadeOutMs}ms ${GLYPH_INTERACTION_EASE_OUT} ${GLYPH_INTERACTION_FADE_OUT_HOLD_MS}ms`
                      const baseGlyphScale =
                        planet.name === "sun" ? 0.945 : planet.name === "mars" ? 0.69 : planet.name === "venus" ? 0.88 : 1
                      const glyphSize = 20 * baseGlyphScale
                      const glyphGlowTiming = getGlyphGlowTiming(planet.name)
                      const glyphGlowAnimation = `planet-glyph-glow ${glyphGlowTiming.durationSec}s ease-in-out ${glyphGlowTiming.delaySec}s infinite alternate`
                      const glyphCoreFilter = "drop-shadow(0 0 1.6px rgba(255,255,255,0.58))"
                      const glyphHaloBaseFilter =
                        "url(#glyph-halo-only) drop-shadow(0 0 6.4px rgba(255,255,255,0.98)) drop-shadow(0 0 16px rgba(255,255,255,0.88))"
                      const glyphHaloHoverFilter =
                        "url(#glyph-halo-only) drop-shadow(0 0 7.6px rgba(255,255,255,1)) drop-shadow(0 0 19.2px rgba(255,255,255,0.95))"
                      const glyphHaloFilter = isHovered ? glyphHaloHoverFilter : glyphHaloBaseFilter

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
                            <>
                              <image
                                href={glyphSrc}
                                x={position.x - glyphSize / 2}
                                y={position.y - glyphSize / 2}
                                width={glyphSize}
                                height={glyphSize}
                                preserveAspectRatio="xMidYMid meet"
                                style={{
                                  pointerEvents: "none",
                                  filter: glyphHaloFilter,
                                  animation: glyphGlowAnimation,
                                  mixBlendMode: "screen",
                                  transformBox: "fill-box",
                                  transformOrigin: "center",
                                  transform: `scale(${interactionScale})`,
                                  opacity: isInteractionActive ? 0.94 : 0.86,
                                  transition: glyphTransition,
                                }}
                              />
                              <image
                                href={glyphSrc}
                                x={position.x - glyphSize / 2}
                                y={position.y - glyphSize / 2}
                                width={glyphSize}
                                height={glyphSize}
                                preserveAspectRatio="xMidYMid meet"
                                style={{
                                  pointerEvents: "none",
                                  filter: glyphCoreFilter,
                                  transformBox: "fill-box",
                                  transformOrigin: "center",
                                  transform: `scale(${interactionScale})`,
                                  opacity: isInteractionActive ? 1 : 0.92,
                                  transition: glyphTransition,
                                }}
                              />
                            </>
                          ) : (
                            <>
                              <text
                                x={position.x}
                                y={position.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className={`fill-white font-sans text-xl select-none ${
                                  currentPlanetUnderPointer === planet.name ? "fill-white" : ""
                                }`}
                                style={{
                                  transform: `scale(${baseGlyphScale * interactionScale})`,
                                  transformOrigin: `${position.x}px ${position.y}px`,
                                  opacity: isInteractionActive ? 0.94 : 0.86,
                                  transition: glyphTransition,
                                  filter: glyphHaloFilter,
                                  animation: glyphGlowAnimation,
                                }}
                              >
                                {glyphFallback}
                              </text>
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
                                  filter: glyphCoreFilter,
                                }}
                              >
                                {glyphFallback}
                              </text>
                            </>
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
                      (horoscopeData.mc?.ChartPosition?.Ecliptic?.DecimalDegrees !== undefined ||
                        horoscopeData.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees !== undefined) && (
                        <>
                          {(() => {
                            const mcLong = horoscopeData.mc.ChartPosition?.Ecliptic?.DecimalDegrees
                            const ascLong = horoscopeData.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees
                            if (mcLong === undefined && ascLong === undefined) return null

                            const mcTheta = mcLong !== undefined ? adjustToCanvasAngle(mcLong) : null
                            const ascTheta = ascLong !== undefined ? adjustToCanvasAngle(ascLong) : null

                            const mcInnerPos = mcTheta !== null ? polarToCartesian(200, 200, 50, mcTheta) : null
                            const mcOuterPos = mcTheta !== null ? polarToCartesian(200, 200, 190, mcTheta) : null
                            const mcLabelPos = mcTheta !== null ? polarToCartesian(200, 200, 175, mcTheta) : null

                            const horizonPosA = ascTheta !== null ? polarToCartesian(200, 200, 188, ascTheta) : null
                            const horizonPosB =
                              ascTheta !== null ? polarToCartesian(200, 200, 188, norm360(ascTheta + 180)) : null
                            const horizonLabelPos = ascTheta !== null ? polarToCartesian(200, 200, 166, ascTheta) : null

                            return (
                              <g>
                                {horizonPosA && horizonPosB && (
                                  <>
                                    <line
                                      x1={horizonPosA.x}
                                      y1={horizonPosA.y}
                                      x2={horizonPosB.x}
                                      y2={horizonPosB.y}
                                      stroke="white"
                                      strokeWidth="1.05"
                                      opacity="0.78"
                                    />
                                    {horizonLabelPos && (
                                      <text
                                        x={horizonLabelPos.x}
                                        y={horizonLabelPos.y}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="white"
                                        fontSize="8"
                                        style={{ fontFamily: MONOTYPE_FONT_STACK }}
                                      >
                                        HZ
                                      </text>
                                    )}
                                  </>
                                )}
                                {mcInnerPos && mcOuterPos && mcLabelPos && (
                                  <>
                                    <line
                                      x1={mcInnerPos.x}
                                      y1={mcInnerPos.y}
                                      x2={mcOuterPos.x}
                                      y2={mcOuterPos.y}
                                      stroke="white"
                                      strokeWidth="1.4"
                                    />
                                    <text
                                      x={mcLabelPos.x}
                                      y={mcLabelPos.y}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill="white"
                                      fontSize="11"
                                      style={{ fontFamily: MONOTYPE_FONT_STACK }}
                                    >
                                      MC
                                    </text>
                                  </>
                                )}
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
                        const stroke = getMajorAspectStrokeColor(aspect.aspectType)
                        const strokeWidth = 1

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
                          const aspectColor = getMajorAspectStrokeColor(aspect.aspectType)
                          const aspectWidth = 1
                          let aspectOpacity = Math.min(data.opacity, MAX_ASPECT_LINE_OPACITY)

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
                  <div className="pointer-events-none absolute right-2 bottom-8 text-right font-mono text-[12px] md:text-[14px] uppercase tracking-wide text-white/70">
                    <div>{formData.datetime ? new Date(formData.datetime).toLocaleString("en-US") : "No Date"}</div>
                    <div>{sanitizeLocationLabel(formData.location) || "No Location"}</div>
                  </div>
                  <div className="fixed bottom-[86px] inset-x-0 z-30 pointer-events-none">
                    <div className="mx-auto w-full max-w-[calc(1400px+2rem)] md:max-w-[calc(1400px+4rem)] px-4 md:px-8 flex justify-start">
                      <button
                        type="button"
                        onClick={handlePlaybackTogglePress}
                        className={`pointer-events-auto flex items-center justify-center border border-white/80 bg-black/75 text-white/90 hover:bg-white hover:text-black transition-colors ${
                          !isPlaybackActive ? "play-idle-pulse" : ""
                        }`}
                        title={isPlaybackActive ? "Stop" : "Play"}
                        style={{ width: 56, height: 56 }}
                      >
                        {isPlaybackActive ? (
                          <svg width="28" height="28" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <rect x="5" y="5" width="10" height="10" />
                          </svg>
                        ) : (
                          <svg width="28" height="28" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M6 4 L16 10 L6 16 Z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showPlanets && (
              <div className="">
                <div className="bg-white text-black p-3 font-mono flex items-center justify-between">
                  <div>
                    <h2 className="text-[10px] uppercase tracking-wider">Astrological Data</h2>
                    <p className="text-[9px] mt-1 opacity-60">
                      ASC: {horoscopeData.ascendant.sign.label}{" "}
                      {horoscopeData.ascendant.ChartPosition.Ecliptic.ArcDegreesFormatted30}
                    </p>
                  </div>
                  <div className="text-right text-[9px] opacity-60">
                    <div>{sanitizeLocationLabel(formData.location)}</div>
                    <div>{new Date(formData.datetime).toLocaleString("en-US")}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-[9px]">
                    <thead>
                      <tr className="bg-gray-800">
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Glyph
                        </th>
                        <th className="text-right p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Ecliptic (°)
                        </th>
                        <th className="text-left p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Sign
                        </th>
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          House
                        </th>
                        <th className="text-left p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Position
                        </th>
                        <th className="text-right p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Horizon (°)
                        </th>
                        <th className="text-center p-2 font-normal uppercase tracking-wide">Retrograde</th>
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
                    <h2 className="text-[10px] uppercase tracking-wider">Astrological Aspects</h2>
                    <p className="text-[9px] mt-1 opacity-60">Conjunction, Opposition, Trine, Square, Sextile</p>
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
                          Planet 1
                        </th>
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Aspect
                        </th>
                        <th className="text-center p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Planet 2
                        </th>
                        <th className="text-right p-2 font-normal uppercase tracking-wide border-r border-gray-600">
                          Angle (°)
                        </th>
                        <th className="text-right p-2 font-normal uppercase tracking-wide">Orb (°)</th>
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
                          return (
                            mainPlanets.includes(aspect.point1.name) &&
                            mainPlanets.includes(aspect.point2.name) &&
                            isMajorAspectType(aspect.aspectType)
                          )
                        })
                        .map((aspect, index) => {
                          const aspectSymbol = getMajorAspectSymbol(aspect.aspectType)

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
                                <span className="text-lg" title={getMajorAspectLabel(aspect.aspectType)}>
                                  {aspectSymbol}
                                </span>
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
                        Aspects of {planetName.toUpperCase()}
                      </h2>
                      {aspects.map((aspect, index) => {
                        const aspectKey = getMajorAspectKey(aspect.aspectType)
                        if (!aspectKey) return null

                        const aspectSymbol = getMajorAspectSymbol(aspect.aspectType)
                        let aspectColor = "text-white"
                        let brightness = "brightness-75"

                        if (aspectKey === "opposition") {
                          aspectColor = "text-red-400"
                          brightness = "brightness-100"
                        } else if (aspectKey === "square") {
                          aspectColor = "text-violet-400"
                          brightness = "brightness-100"
                        } else if (aspectKey === "conjunction") {
                          aspectColor = "text-yellow-300"
                        } else if (aspectKey === "trine") {
                          aspectColor = "text-green-400"
                        } else if (aspectKey === "sextile") {
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
                            <span className={`text-lg ${aspectColor} ${brightness}`} title={getMajorAspectLabel(aspect.aspectType)}>
                              {aspectSymbol}
                            </span>
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
          <div className="pointer-events-auto border border-white/70 bg-black/75 backdrop-blur-sm px-1.5 py-1.5 md:px-2 md:py-2 w-full max-w-[560px]">
            <div className="grid grid-cols-4 gap-1.5">
              {NAVIGATION_MODES.map((mode) => {
                const isActiveMode = navigationMode === mode
                const modeHoverKey = `mode:${mode}`
                const downloadHoverKey = `download:${mode}`
                const isModeHoverActive = topPanelHoverKey === modeHoverKey
                const isDownloadHoverActive = topPanelHoverKey === downloadHoverKey
                const isCardHoverActive = isModeHoverActive || isDownloadHoverActive
                return (
                  <div
                    key={`top-nav-${mode}`}
                    className={`relative border px-1 py-1 transition-opacity duration-150 ${
                      isActiveMode ? "border-white/95 bg-white/8" : "border-gray-600/85 bg-black/35"
                    } ${isCardHoverActive ? "opacity-100" : "opacity-50"}`}
                  >
                    <div className="relative">
                      <button
                        onClick={() => setNavigationModeFromMenu(mode)}
                        onMouseEnter={() => setTopPanelHoverKey(modeHoverKey)}
                        onMouseLeave={() => setTopPanelHoverKey((current) => (current === modeHoverKey ? null : current))}
                        onFocus={() => setTopPanelHoverKey(modeHoverKey)}
                        onBlur={() => setTopPanelHoverKey((current) => (current === modeHoverKey ? null : current))}
                        className={`w-full font-mono text-[10px] md:text-[12px] uppercase tracking-wide border px-1.5 py-1 transition-colors ${
                          isActiveMode
                            ? "bg-white text-black border-white"
                            : "bg-transparent text-white border-gray-600 hover:border-white"
                        } ${isModeHoverActive ? "opacity-100" : "opacity-50"}`}
                      >
                        {NAV_MODE_HINT_LABEL[mode]}
                      </button>
                      <span
                        className={`pointer-events-none absolute left-1/2 -translate-x-[55%] top-[calc(100%+150px)] w-[280px] border border-white/75 bg-black/88 px-2.5 py-2 text-left font-mono text-[13px] md:text-[15px] normal-case leading-tight text-white transition-opacity duration-150 ${
                          isModeHoverActive ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        {NAV_MODE_INSTRUCTION_BY_MODE[mode]}
                      </span>
                      <span
                        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+12px)] h-[138px] w-px bg-white/75 transition-opacity duration-150 ${
                          isModeHoverActive ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    </div>
                    <div className="relative mt-1">
                      <button
                        onClick={() => downloadNavigationModeMp3(mode)}
                        onMouseEnter={() => setTopPanelHoverKey(downloadHoverKey)}
                        onMouseLeave={() =>
                          setTopPanelHoverKey((current) => (current === downloadHoverKey ? null : current))
                        }
                        onFocus={() => setTopPanelHoverKey(downloadHoverKey)}
                        onBlur={() => setTopPanelHoverKey((current) => (current === downloadHoverKey ? null : current))}
                        disabled={!horoscopeData || isExportingMp3}
                        className={`flex w-full items-center justify-center border px-1.5 py-1 transition-colors ${
                          !horoscopeData || isExportingMp3
                            ? "border-gray-700 text-gray-500 cursor-not-allowed"
                            : "border-white/70 text-white/85 hover:bg-white hover:text-black hover:border-white"
                        } ${isDownloadHoverActive ? "opacity-100" : "opacity-50"}`}
                      >
                        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
                          <path d="M3 8.5V12.5H13V8.5" />
                          <path d="M8 2.5V9" />
                          <path d="M5.8 6.8L8 9L10.2 6.8" />
                        </svg>
                      </button>
                      <span
                        className={`pointer-events-none absolute left-1/2 -translate-x-[55%] top-[calc(100%+150px)] whitespace-nowrap border border-white/75 bg-black/88 px-2.5 py-2 font-mono text-[13px] md:text-[15px] text-left text-white transition-opacity duration-150 ${
                          isDownloadHoverActive ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        {DOWNLOAD_TOOLTIP_TEXT}
                      </span>
                      <span
                        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+12px)] h-[138px] w-px bg-white/75 transition-opacity duration-150 ${
                          isDownloadHoverActive ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={resetToInitialState}
                  className="font-mono text-[10px] md:text-[12px] uppercase tracking-wide border border-white px-1.5 py-1 brightness-50 hover:brightness-100 hover:bg-white hover:text-black transition-colors"
                >
                  RESET
                </button>
                <button
                  onClick={openInfoOverlay}
                  className="font-mono text-[10px] md:text-[12px] uppercase tracking-wide border border-white px-1.5 py-1 brightness-50 hover:brightness-100 hover:bg-white hover:text-black transition-colors"
                >
                  INFO
                </button>
              </div>
            </div>
            {isExportingMp3 && (
              <div className="mt-1.5 text-center font-mono text-[9px] md:text-[11px] uppercase tracking-wide text-white/70">
                RENDER MP3...
              </div>
            )}
            {pendingMp3Download && !isExportingMp3 && (
              <a
                href={pendingMp3Download.url}
                download={pendingMp3Download.fileName}
                className="mt-1.5 block w-full text-center font-mono text-[9px] md:text-[11px] uppercase tracking-wide border border-white px-3 py-1.5 brightness-50 hover:brightness-100 hover:bg-white hover:text-black transition-colors"
              >
                SAVE MP3
              </a>
            )}
          </div>
        </div>
      </div>

      {showInfoOverlay && (
        <div className="fixed inset-0 z-50 bg-black/92">
          <div className="h-full flex items-center justify-center px-10 md:px-20">
            <div className="relative w-full max-w-[900px] px-3 py-4 md:px-4 md:py-5">
              <button
                onClick={retreatInfoParagraph}
                className="absolute -left-3 md:-left-5 top-1/2 -translate-y-1/2 font-mono text-[26px] md:text-[34px] leading-none text-white/50 hover:text-white transition-colors"
                style={{ fontFamily: MONOTYPE_FONT_STACK }}
                aria-label="Previous info page"
              >
                {"<"}
              </button>
              <button
                onClick={advanceInfoParagraph}
                className="absolute -right-3 md:-right-5 top-1/2 -translate-y-1/2 font-mono text-[26px] md:text-[34px] leading-none text-white/50 hover:text-white transition-colors"
                style={{ fontFamily: MONOTYPE_FONT_STACK }}
                aria-label="Next info page"
              >
                {">"}
              </button>
              <p
                className="font-mono text-[18px] md:text-[24px] leading-[1.58] text-white/88"
                style={{ whiteSpace: "pre-line", textAlign: "left" }}
              >
                {INFO_PARAGRAPHS[infoParagraphIndex]}
              </p>
              <div className="mt-5 flex items-center justify-center gap-2.5">
                {INFO_PARAGRAPHS.map((_, index) => {
                  const isActive = index === infoParagraphIndex
                  return (
                    <button
                      key={`info-dot-${index}`}
                      type="button"
                      onClick={() => setInfoParagraphIndex(index)}
                      className="group/dot p-0.5"
                      aria-label={`Go to paragraph ${index + 1}`}
                    >
                      <span
                        className={`block h-2.5 w-2.5 rounded-full border border-white/80 transition-opacity duration-200 group-hover/dot:opacity-100 ${
                          isActive ? "bg-white opacity-100" : "bg-white/15 opacity-45"
                        }`}
                      />
                    </button>
                  )
                })}
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={closeInfoOverlay}
                  className="border border-white/70 px-2 py-1 font-mono text-[10px] md:text-[12px] uppercase tracking-wide text-white/85 hover:bg-white hover:text-black transition-colors"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
