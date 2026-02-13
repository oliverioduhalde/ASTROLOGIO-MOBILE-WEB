"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { calculateCustomHoroscope, type HoroscopeData } from "@/lib/astrology"
import { GlyphAnimationManager } from "@/lib/glyph-animation"
import { usePlanetAudio } from "@/lib/use-planet-audio"

const PLANET_GLYPHS: Record<string, string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  asc: "AC",
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

type AudioEngineMode = "samples" | "hybrid" | "fm_pad"

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

function getZodiacSign(degrees: number) {}

function toCanvasAngle(degrees: number): number {
  return 180 - degrees
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
  const [isSidereal, setIsSidereal] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<"ba" | "cairo" | "manual" | "ba77">("manual")
  const [formData, setFormData] = useState<SubjectFormData>(EMPTY_SUBJECT_FORM)
  const [horoscopeData, setHoroscopeData] = useState<HoroscopeData | null>(null)
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState(false)

  const [loopDuration, setLoopDuration] = useState(180)
  const [isLoopRunning, setIsLoopRunning] = useState(false)
  const [pointerRotation, setPointerRotation] = useState(0)
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
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null)
  const lastClickTimeRef = useRef<number>(0)
  const [isPaused, setIsPaused] = useState(false)
  const [pausedRotation, setPausedRotation] = useState(0)

  const [hoveredGlyph, setHoveredGlyph] = useState<string | null>(null)
  const [glyphHoverOpacity, setGlyphHoverOpacity] = useState(0)
  const [showAspectIndicator, setShowAspectIndicator] = useState(false) // Declared showAspectIndicator
  const aspectClickTimersRef = useRef<Record<string, NodeJS.Timeout[]>>({})
  const affectedScaleTimersRef = useRef<Record<string, { start: NodeJS.Timeout | null; end: NodeJS.Timeout | null }>>(
    {},
  )
  const glyphScaleTriggerLockRef = useRef<Record<string, number>>({})
  const skipNextAutoCalculateRef = useRef(false)
  const [locationSuggestions, setLocationSuggestions] = useState<GeoSuggestion[]>([])
  const [isResolvingLocation, setIsResolvingLocation] = useState(false)

  const modalSunSignIndex = useMemo(() => {
    const sunDegrees = horoscopeData?.planets?.find((p) => p.name === "sun")?.ChartPosition?.Ecliptic?.DecimalDegrees
    if (typeof sunDegrees !== "number" || Number.isNaN(sunDegrees)) return null
    return Math.floor(norm360(sunDegrees) / 30) % 12
  }, [horoscopeData?.planets])

  const currentModeLabel =
    modalSunSignIndex !== null ? MODE_NAME_BY_SIGN_INDEX[modalSunSignIndex] || "Modal" : "Modal"

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
  } =
    usePlanetAudio({
      fadeIn: audioFadeIn,
      fadeOut: audioFadeOut,
      backgroundVolume: backgroundVolume,
      elementSoundVolume: elementSoundVolume,
      aspectsSoundVolume: aspectsSoundVolume,
      masterVolume: masterVolume,
      tuningCents: tuningCents,
      dynAspectsFadeIn: dynAspectsFadeIn,
      dynAspectsSustain: dynAspectsSustain,
      dynAspectsFadeOut: dynAspectsFadeOut,
      modalEnabled,
      modalSunSignIndex,
      audioEngineMode,
      synthVolume,
    })
  const lastPlayedPlanetRef = useRef<string | null>(null)

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
      console.log("[v0] Calculating with isSidereal:", isSidereal)
      const data = await calculateCustomHoroscope(birthDate, birthTime, latitude, longitude, isSidereal, selectedPreset)
      console.log("[v0] Horoscope data received:", data)
      console.log("[v0] Aspects found:", data.aspects?.length || 0, data.aspects)
      setHoroscopeData(data)
    }

    calculateHoroscope()
  }, [formData, isSidereal, selectedPreset, showSubject])

  useEffect(() => {
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current)
      }
    }
  }, [])

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
    const peakResetInterval = setInterval(() => {
      setPeakLevelLeftPre(0)
      setPeakLevelRightPre(0)
      setPeakLevelLeftPost(0)
      setPeakLevelRightPost(0)
    }, 5000)
    
    return () => clearInterval(peakResetInterval)
  }, [])

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

  // Remove playPlanetSound from dependencies, use useCallback from hook instead
  const triggerPlanetSound = useCallback(
    (planetName: string | null, angle: number) => {
      if (planetName && planetName !== lastPlayedPlanetRef.current) {
        console.log(`[v0] Triggering sound for planet: ${planetName} at angle: ${angle}`)
        lastPlayedPlanetRef.current = planetName
        playPlanetSound(planetName)
      } else if (!planetName) {
        lastPlayedPlanetRef.current = null
      }
    },
    [playPlanetSound],
  ) // playPlanetSound is stable due to the hook

  useEffect(() => {
    if (currentPlanetUnderPointer && currentPlanetUnderPointer !== lastPlayedPlanetRef.current) {
      console.log(`[v0] Triggering sound for planet: ${currentPlanetUnderPointer} at angle: ${debugPointerAngle}`)

      const planet = horoscopeData?.planets.find((p) => p.name === currentPlanetUnderPointer)
      const declination = planet?.declination || 0

      const aspectsForPlanet =
        horoscopeData?.aspects?.filter(
          (aspect) =>
            (aspect.point1.name.toLowerCase() === currentPlanetUnderPointer.toLowerCase() ||
              aspect.point2.name.toLowerCase() === currentPlanetUnderPointer.toLowerCase()) &&
            ["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"].includes(aspect.aspectType),
        ) || []

      playPlanetSound(
        currentPlanetUnderPointer,
        debugPointerAngle,
        declination,
        aspectsForPlanet,
        horoscopeData?.planets || [],
        horoscopeData?.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees || 0,
        horoscopeData?.mc?.ChartPosition?.Ecliptic?.DecimalDegrees || 0,
      )
      lastPlayedPlanetRef.current = currentPlanetUnderPointer
    }
  }, [currentPlanetUnderPointer, debugPointerAngle, horoscopeData?.planets, horoscopeData?.aspects, playPlanetSound])

  useEffect(() => {
    if (!isLoopRunning) {
      lastPlayedPlanetRef.current = null
      // When loop ends, stop background sound
      stopBackgroundSound()
      stopElementBackground()
    }
  }, [isLoopRunning, stopBackgroundSound, stopElementBackground])

  useEffect(() => {
    if (hoveredGlyph && isLoopRunning) {
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
  }, [hoveredGlyph, isLoopRunning, glyphHoverOpacity])

  useEffect(() => {
    if (!showDynAspects || !currentPlanetUnderPointer || !horoscopeData?.aspects) {
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
        const targetOpacity = 0.8 // Maximum opacity is 80%
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
  }, [currentPlanetUnderPointer, showDynAspects, dynAspectsFadeIn, horoscopeData?.aspects])

  useEffect(() => {
    if (showDynAspects && currentPlanetUnderPointer === null && Object.keys(activePlanetAspectsMap).length > 0) {
      const fadeOutInterval = setInterval(() => {
        setActivePlanetAspectsMap((prevMap) => {
          const result = { ...prevMap }
          const targetOpacity = 0
          const decrement = 0.8 / (dynAspectsFadeOut * 10) // Divide by (seconds * 10) for 100ms intervals

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
  }, [currentPlanetUnderPointer, showDynAspects, activePlanetAspectsMap, dynAspectsFadeOut])

  const handleStartClick = () => {
    const currentTime = Date.now()
    const isDoubleClick = currentTime - lastClickTimeRef.current < 1000
    lastClickTimeRef.current = currentTime

    // Double click: Reset everything
    if (isDoubleClick) {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current)
        intervalIdRef.current = null
      }
      setIsLoopRunning(false)
      setIsPaused(false)
      setPointerRotation(180)
      setPausedRotation(0)
      setCurrentPlanetUnderPointer(null)
      setDebugPointerAngle(0)
      setStartButtonPhase("contracted")
      glyphAnimationManager["animations"]?.clear()
      setAnimatedPlanets({})
      stopBackgroundSound() // Stop background sound on reset
      stopElementBackground()
      setHoveredGlyph(null) // Clear hovered glyph on reset
      setGlyphHoverOpacity(0) // Clear hover opacity on reset
      setActivePlanetAspectsMap({}) // Clear accumulated aspects map on reset
      stopAll()
      setFormData({ ...PRESET_BA77_FORM })
      setSelectedPreset("ba77")
      setShowSubject(true)
      setShowChart(false)
      setError("")
      setElementSoundVolume(2)
      setBackgroundVolume(2)
      setAspectsSoundVolume(30)
      setMasterVolume(50)
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
      setIsSidereal(false)
      return
    }

    // Single click: Toggle pause/resume
    if (isLoopRunning) {
      setIsPaused(true)
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current)
        intervalIdRef.current = null
      }
      return
    }

    if (isPaused) {
      // Resume from pause
      setIsPaused(false)
      setIsLoopRunning(true)

      const startTime = Date.now()
      const totalDuration = loopDuration * 1000
      const ascDegrees = horoscopeData?.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0
      const pauseOffset = pausedRotation * (loopDuration / 360)

      intervalIdRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime + pauseOffset * 1000
        const state = calculatePointerState(elapsed, loopDuration * 1000, ascDegrees)

        setPointerRotation(state.pointerRotation)
        setPausedRotation(state.pointerRotation)
        setDebugPointerAngle(Math.round(state.adjustedAngle))
        if (horoscopeData?.planets) {
          let detectedPlanet = null
          const chartRotation = 180 - ascDegrees

          for (const planet of horoscopeData.planets) {
            const planetDegrees = planet.ChartPosition.Ecliptic.DecimalDegrees
            const planetCanvasAngle = norm360(planetDegrees + chartRotation)
            const diff = Math.abs(state.adjustedAngle - planetCanvasAngle)
            const circularDiff = Math.min(diff, 360 - diff)

            if (circularDiff < 5) {
              detectedPlanet = planet.name
              break
            }
          }
          setCurrentPlanetUnderPointer(detectedPlanet)
        }

        if (elapsed >= totalDuration) {
          setPointerRotation(180)
          setIsLoopRunning(false)
          setIsPaused(false)
          setCurrentPlanetUnderPointer(null)
          setDebugPointerAngle(0)
          setStartButtonPhase("contracted")
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current)
            intervalIdRef.current = null
          }
          stopBackgroundSound() // Stop background sound when loop finishes
          stopElementBackground()
        }
      }, 50)
      return
    }

    // Initial start
    setIsLoopRunning(true)
    setStartButtonPhase("expanding")

    setTimeout(() => {
      setStartButtonPhase("stable")
    }, 15000)

    const startTime = Date.now()
    const totalDuration = loopDuration * 1000
    const ascDegrees = horoscopeData?.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0

    intervalIdRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const state = calculatePointerState(elapsed, loopDuration * 1000, ascDegrees)

      setPointerRotation(state.pointerRotation)
      setPausedRotation(state.pointerRotation)
      setDebugPointerAngle(Math.round(state.adjustedAngle))
      if (horoscopeData?.planets) {
        let detectedPlanet = null
        const chartRotation = 180 - ascDegrees

        for (const planet of horoscopeData.planets) {
          const planetDegrees = planet.ChartPosition.Ecliptic.DecimalDegrees
          const planetCanvasAngle = norm360(planetDegrees + chartRotation)
          const diff = Math.abs(state.adjustedAngle - planetCanvasAngle)
          const circularDiff = Math.min(diff, 360 - diff)

          if (circularDiff < 5) {
            detectedPlanet = planet.name
            break
          }
        }
        setCurrentPlanetUnderPointer(detectedPlanet)
      }

      if (elapsed >= totalDuration) {
        setPointerRotation(180)
        setIsLoopRunning(false)
        setCurrentPlanetUnderPointer(null)
        setDebugPointerAngle(0)
        setStartButtonPhase("contracted")
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current)
          intervalIdRef.current = null
        }
        stopBackgroundSound() // Stop background sound when loop finishes
        stopElementBackground()
      }
    }, 50)
    // START BACKGROUND SOUND: Start background sound when loop begins
    playBackgroundSound()
    if (horoscopeData?.planets && horoscopeData?.ascendant) {
      const sunDegrees = horoscopeData.planets.find((p) => p.name === "sun")?.ChartPosition.Ecliptic.DecimalDegrees
      if (sunDegrees !== undefined) {
        playElementBackground(getElementFromDegrees(sunDegrees), undefined, 0, 30, {
          modalEnabled,
          sunSignIndex: modalSunSignIndex,
        })
      }
    }
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
      console.log("[v0] Calculating with isSidereal:", isSidereal)
      const data = await calculateCustomHoroscope(birthDate, birthTime, latitude, longitude, isSidereal, presetToUse)
      console.log("[v0] Horoscope data received:", data)
      console.log("[v0] Aspects found:", data.aspects?.length || 0, data.aspects)
      setHoroscopeData(data)
      skipNextAutoCalculateRef.current = true
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

  const triggerPlanetGlyphScale = (planetName: string, aspectsForPlanet: any[]) => {
    if (!horoscopeData?.planets) return
    const now = Date.now()
    const lastTriggeredAt = glyphScaleTriggerLockRef.current[planetName] ?? 0
    if (now - lastTriggeredAt < 500) return
    glyphScaleTriggerLockRef.current[planetName] = now

    glyphAnimationManager.startAnimation(planetName)

    const affectedPlanets = new Set(
      aspectsForPlanet
        .map((aspect) => (aspect.point1.name === planetName ? aspect.point2.name : aspect.point1.name))
        .filter((name) => name !== planetName && horoscopeData.planets.some((p) => p.name === name)),
    )
    const mainAnimationDurationMs = 15000
    const affectedStartDelayMs = 2000
    const affectedScaleDurationMs = Math.max(0, mainAnimationDurationMs - 2 * affectedStartDelayMs)

    if (affectedPlanets.size > 0) {
      affectedPlanets.forEach((name) => {
        const existingTimers = affectedScaleTimersRef.current[name]
        if (existingTimers?.start) clearTimeout(existingTimers.start)
        if (existingTimers?.end) clearTimeout(existingTimers.end)

        const startTimer = setTimeout(() => {
          setAnimatedPlanets((prev) => {
            const next = { ...prev }
            next[name] = Math.max(next[name] ?? 1, 1.3)
            return next
          })
        }, affectedStartDelayMs)

        const endTimer = setTimeout(() => {
          setAnimatedPlanets((prev) => {
            if (!prev[name] || prev[name] <= 1) return prev
            const next = { ...prev }
            delete next[name]
            return next
          })
          affectedScaleTimersRef.current[name] = { start: null, end: null }
        }, affectedStartDelayMs + affectedScaleDurationMs)

        affectedScaleTimersRef.current[name] = { start: startTimer, end: endTimer }
      })
    }

    // Update animation state every frame
    const interval = setInterval(() => {
      const scale = glyphAnimationManager.getScale(planetName)
      const animation = glyphAnimationManager["animations"]?.get(planetName)
      setAnimatedPlanets((prev) => ({
        ...prev,
        [planetName]: scale,
      }))

      // Check if animation is complete and a certain time has passed to ensure it has been visible
      if (
        scale === 1 &&
        animation?.startTime &&
        Date.now() - animation.startTime > 20000
      ) {
        clearInterval(interval)
      }
    }, 16) // ~60fps
  }

  const handlePlanetMouseDown = (planetName: string, degrees: number) => {
    // Added hover detection logic and start animation
    setHoveredGlyph(planetName)
    setGlyphHoverOpacity(0) // Reset opacity to start fade in

    const planet = horoscopeData?.planets?.find((p) => p.name === planetName)
    if (!planet) return

    const aspectsForPlanet = getAspectsForPlanet(planetName)
    triggerPlanetGlyphScale(planetName, aspectsForPlanet)

    const ascDegrees = horoscopeData?.ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0
    const mcDegrees = horoscopeData?.mc?.ChartPosition?.Ecliptic?.DecimalDegrees ?? 0

    const currentPlanets = horoscopeData?.planets ?? []

    playPlanetSound(
      planetName,
      degrees,
      planet.declination || 0,
      aspectsForPlanet,
      currentPlanets,
      ascDegrees,
      mcDegrees,
      40,
    )

    if (showDynAspects && aspectsForPlanet.length > 0) {
      const existingTimers = aspectClickTimersRef.current[planetName]
      if (existingTimers) {
        existingTimers.forEach((timerId) => clearTimeout(timerId))
      }
      aspectClickTimersRef.current[planetName] = []

      const targetOpacity = 0.8
      setActivePlanetAspectsMap((prevMap) => ({
        ...prevMap,
        [planetName]: {
          aspects: aspectsForPlanet,
          opacity: 0,
        },
      }))

      const fadeInInterval = setInterval(() => {
        setActivePlanetAspectsMap((prevMap) => {
          const current = prevMap[planetName]
          if (!current) return prevMap
          const increment = targetOpacity / Math.max(1, dynAspectsFadeIn * 10)
          const newOpacity = Math.min(current.opacity + increment, targetOpacity)
          return {
            ...prevMap,
            [planetName]: {
              aspects: current.aspects,
              opacity: newOpacity,
            },
          }
        })
      }, 100)

      const fadeInTimeout = setTimeout(() => {
        clearInterval(fadeInInterval)
      }, dynAspectsFadeIn * 1000)
      aspectClickTimersRef.current[planetName].push(fadeInInterval, fadeInTimeout)

      const fadeOutStart = (dynAspectsFadeIn + dynAspectsSustain) * 1000
      const fadeOutStartTimeout = setTimeout(() => {
        const fadeOutInterval = setInterval(() => {
          setActivePlanetAspectsMap((prevMap) => {
            const current = prevMap[planetName]
            if (!current) return prevMap
            const decrement = targetOpacity / Math.max(1, dynAspectsFadeOut * 10)
            const newOpacity = Math.max(current.opacity - decrement, 0)
            if (newOpacity <= 0) {
              const updated = { ...prevMap }
              delete updated[planetName]
              return updated
            }
            return {
              ...prevMap,
              [planetName]: {
                aspects: current.aspects,
                opacity: newOpacity,
              },
            }
          })
        }, 100)

        const fadeOutTimeout = setTimeout(() => {
          clearInterval(fadeOutInterval)
        }, dynAspectsFadeOut * 1000)

        aspectClickTimersRef.current[planetName].push(fadeOutInterval, fadeOutTimeout)
      }, fadeOutStart)
      aspectClickTimersRef.current[planetName].push(fadeOutStartTimeout)
    }
  }

  const isPlanetUnderPointer = (planetDegrees: number, pointerAngle: number): boolean => {
    if (!showPointer || !isLoopRunning) return false

    // Calculate the difference in angles, considering circular nature
    let angleDiff = Math.abs(planetDegrees - pointerAngle)
    angleDiff = Math.min(angleDiff, 360 - angleDiff)

    // Check if planet is within ±5 degrees of pointer
    return angleDiff <= 5
  }

  // The planet detection is now handled efficiently within the animation interval (handleStartClick)

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
        <div className="relative mb-6 pb-2 border-b border-white flex items-center justify-between">
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="font-mono text-[9px] uppercase tracking-wider border border-white px-3 py-1.5 hover:bg-white hover:text-black transition-colors"
            >
              {menuOpen ? "✕" : "☰"}
            </button>

            {menuOpen && (
              <div className="absolute top-full left-0 mt-2 bg-black border border-white p-3 z-10 min-w-[200px] md:scale-[2.3] md:origin-top-left">
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
                </div>
              </div>
            )}
          </div>

          <h1 className="text-base md:text-lg font-mono absolute left-1/2 transform -translate-x-1/2">ASTRO.LOG.IO</h1>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-white/80">
            {modalEnabled ? `Modo: ${currentModeLabel}` : "Modo: OFF"}
          </div>

          {/* START button - Moved to within the chart's rendering logic */}
        </div>

        {showSubject && (
          <div className="space-y-2">
            <div className="flex gap-1 mb-2">
              <button
                onClick={applyPresetBA}
                className={`px-1.5 py-0.5 text-[7px] font-mono border transition-colors ${
                  selectedPreset === "ba"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                19740916 BA
              </button>
              <button
                onClick={applyPresetCairo}
                className={`px-1.5 py-0.5 text-[7px] font-mono border transition-colors ${
                  selectedPreset === "cairo"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                19700101 Cairo
              </button>
              <button
                onClick={applyPresetBA77}
                className={`px-1.5 py-0.5 text-[7px] font-mono border transition-colors ${
                  selectedPreset === "ba77"
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white border-gray-600 hover:border-white"
                }`}
              >
                19770928 BA
              </button>
              <button
                onClick={setManualMode}
                className={`px-1.5 py-0.5 text-[7px] font-mono border transition-colors ${
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
              <div className="mb-8 flex justify-center">
                <div className="relative w-full max-w-[400px] aspect-square md:w-[min(90vh,90vw)] md:h-[min(90vh,90vw)] md:max-w-none md:aspect-auto">
                  <svg viewBox="0 0 400 400" className="w-full h-full">
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
                      const glyph = PLANET_GLYPHS[planet.name]
                      const scale = animatedPlanets[planet.name] || 1
                      // Added hover detection for glyphs
                      const isHovered = hoveredGlyph === planet.name
                      const baseGlyphScale = planet.name === "sun" ? 1.5 : planet.name === "venus" ? 0.8 : 1
                      const pointerLeadAngle = norm360(debugPointerAngle + 7)
                      const glyphAngle = adjustToCanvasAngle(adjustedDegrees)
                      const pointerGlyphDiff = Math.abs(pointerLeadAngle - glyphAngle)
                      const pointerCircularDiff = Math.min(pointerGlyphDiff, 360 - pointerGlyphDiff)
                      const pointerScale = pointerCircularDiff < 5 ? 1.5 : 1

                      return (
                        <g
                          key={planet.name}
                          style={{ cursor: "pointer" }}
                          onMouseDown={() => handlePlanetMouseDown(planet.name, originalDegrees)}
                          onTouchStart={() => handlePlanetMouseDown(planet.name, originalDegrees)}
                          // Added onMouseEnter and onMouseLeave to track hovered glyph
                          onMouseEnter={() => {
                            setHoveredGlyph(planet.name)
                            setGlyphHoverOpacity(0) // Reset opacity to start fade in
                            triggerPlanetGlyphScale(planet.name, getAspectsForPlanet(planet.name))

                            if (isLoopRunning && showDynAspects) {
                              const planetAspects = horoscopeData.aspects.filter(
                                (aspect) =>
                                  (aspect.point1.name === planet.name ||
                                    aspect.point2.name === planet.name ||
                                    aspect.point1.name === "asc" ||
                                    aspect.point1.name === "mc" ||
                                    aspect.point2.name === "asc" ||
                                    aspect.point2.name === "mc") &&
                                  aspect.point1.name !== aspect.point2.name &&
                                  ["Conjunción", "Oposición", "Trígono", "Cuadrado", "Sextil"].includes(
                                    aspect.aspectType,
                                  ),
                              )
                              // Update activePlanetAspectsMap for the hovered glyph
                              setActivePlanetAspectsMap((prevMap) => ({
                                ...prevMap,
                                [planet.name]: {
                                  aspects: planetAspects,
                                  opacity: 1, // Fully visible when hovered
                                },
                              }))
                              setDynAspectsOpacity(1) // Ensure overall opacity is set
                            }
                          }}
                          onMouseLeave={() => {
                            setHoveredGlyph(null)
                            setGlyphHoverOpacity(0) // Start fade out
                            if (isLoopRunning && showDynAspects) {
                              // Remove the aspect map for the hovered glyph
                              setActivePlanetAspectsMap((prevMap) => {
                                const newMap = { ...prevMap }
                                delete newMap[planet.name]
                                return newMap
                              })
                              // Check if any other glyphs are still active to determine overall opacity
                              if (Object.keys(activePlanetAspectsMap).length === 0) {
                                setDynAspectsOpacity(0)
                              }
                            }
                          }}
                        >
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
                              transform: `scale(${baseGlyphScale * scale * (isHovered ? 1.2 : 1) * pointerScale})`,
                              transformOrigin: `${position.x}px ${position.y}px`,
                              transition: "transform 7s ease-in-out",
                            }}
                            filter={isHovered ? "url(#glow)" : undefined} // Applied glow filter on hover
                          >
                            {glyph}
                          </text>
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

                        // Determine color and width based on aspect type
                        let stroke = "#888"
                        let strokeWidth = 1.5
                        if (aspect.aspectType === "Oposición") {
                          stroke = "#FF8C00"
                          strokeWidth = 2
                        } else if (aspect.aspectType === "Conjunción") {
                          stroke = "#9D4EDD"
                        } else if (aspect.aspectType === "Trígono") {
                          stroke = "#00FF00"
                        } else if (aspect.aspectType === "Cuadrado") {
                          stroke = "#FF0000"
                        } else if (aspect.aspectType === "Sextil") {
                          stroke = "#0099FF"
                        }

                        return (
                          <line
                            key={index}
                            x1={pos1.x}
                            y1={pos1.y}
                            x2={pos2.x}
                            y2={pos2.y}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            opacity="1"
                            style={{ pointerEvents: "none" }}
                          />
                        )
                      })}

                    {showPointer && (
                      <>
                        {/* START button - Earth symbol (circle + cross) */}
                        <g style={{ cursor: "pointer", pointerEvents: "auto" }} onClick={handleStartClick}>
                          <circle
                            cx="200"
                            cy="200"
                            r="10"
                            fill="none"
                            stroke="white"
                            strokeWidth="1.5"
                            opacity={isLoopRunning ? 1 : 0.65}
                          />
                          <line
                            x1="200"
                            y1="190"
                            x2="200"
                            y2="210"
                            stroke="white"
                            strokeWidth="1.2"
                            opacity={isLoopRunning ? 1 : 0.65}
                          />
                          <line
                            x1="190"
                            y1="200"
                            x2="210"
                            y2="200"
                            stroke="white"
                            strokeWidth="1.2"
                            opacity={isLoopRunning ? 1 : 0.65}
                          />
                        </g>

                        {/* Animated pointer - rotates clockwise from ASC (180°) */}
                        {!isLoopRunning && showPointer && (
                          <circle
                            cx="20"
                            cy="200"
                            r="14"
                            fill="white"
                            fillOpacity="0.15"
                            stroke="white"
                            strokeWidth="1"
                            opacity="1"
                            style={{ pointerEvents: "none" }}
                          />
                        )}

                        {/* Update pointer visibility - only show when loop is running */}
                        {showPointer && isLoopRunning && (
                          <g
                            style={{
                              transform: `rotate(${pointerRotation}deg)`,
                              transformOrigin: "200px 200px",
                              transition: "none", // Remove transition for smooth animation
                            }}
                          >
                            <circle
                              cx="20"
                              cy="200"
                              r="14"
                              fill="white"
                              fillOpacity="0.15"
                              stroke="white"
                              strokeWidth="1"
                              opacity="1"
                              style={{ pointerEvents: "none" }}
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
                              degrees = planet?.ChartPosition.Ecliptic.DecimalDegrees
                            }
                            return degrees !== undefined
                              ? polarToCartesian(200, 200, 180, adjustToCanvasAngle(degrees))
                              : null
                          }

                          const pos1 = getPointPosition(aspect.point1.name)
                          const pos2 = getPointPosition(aspect.point2.name)

                          if (!pos1 || !pos2) return null

                          // Determine color and width based on aspect type
                          let aspectColor = "#888"
                          let aspectWidth = 1.5
                          let aspectFilter = "none"

                          if (aspect.aspectType === "Oposición") {
                            aspectColor = "#FF8C00"
                            aspectWidth = 2
                          } else if (aspect.aspectType === "Oposición") {
                            aspectColor = "#FF8C00"
                            aspectWidth = 2
                          } else if (aspect.aspectType === "Conjunción") {
                            aspectColor = "#9D4EDD"
                          } else if (aspect.aspectType === "Trígono") {
                            aspectColor = "#00FF00"
                          } else if (aspect.aspectType === "Cuadrado") {
                            aspectColor = "#FF0000"
                            aspectFilter = "blur(1px)" // Add subtle blur for squares
                          } else if (aspect.aspectType === "Sextil") {
                            aspectColor = "#0099FF"
                          }

                          return (
                            <line
                              key={`aspect-${planetName}-${index}`}
                              x1={pos1.x}
                              y1={pos1.y}
                              x2={pos2.x}
                              y2={pos2.y}
                              stroke={aspectColor}
                              strokeWidth={aspectWidth}
                              style={{
                                opacity: data.opacity, // Each aspect uses its own planet's opacity instead of global dynAspectsOpacity
                                transition: "opacity 0.1s linear",
                                filter: aspectFilter,
                                pointerEvents: "none",
                              }}
                            />
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
                            <span
                              style={{
                                paintOrder: "stroke fill",
                                WebkitTextStroke: "0.3px white",
                              }}
                            >
                              {PLANET_GLYPHS[planet.name] || planet.label}
                            </span>
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
                                <span
                                  className={`${isSmallFont && (aspect.point1.name === "mc" || aspect.point1.name === "asc") ? "text-sm" : "text-base"}`}
                                  style={{
                                    paintOrder: "stroke fill",
                                    WebkitTextStroke: "0.3px white",
                                  }}
                                >
                                  {PLANET_GLYPHS[aspect.point1.name] || aspect.point1.label}
                                </span>
                              </td>
                              <td className="p-2 border-r border-gray-700 text-center">
                                <span className="text-lg">{aspectSymbol}</span>
                              </td>
                              <td className="p-2 border-r border-gray-700 text-center">
                                <span
                                  className={`${isSmallFont && (aspect.point2.name === "mc" || aspect.point2.name === "asc") ? "text-sm" : "text-base"}`}
                                  style={{
                                    paintOrder: "stroke fill",
                                    WebkitTextStroke: "0.3px white",
                                  }}
                                >
                                  {PLANET_GLYPHS[aspect.point2.name] || aspect.point2.label}
                                </span>
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
                            <span>{PLANET_GLYPHS[aspect.point1.name] || aspect.point1.label}</span>
                            <span className={`text-lg ${aspectColor} ${brightness}`}>{aspectSymbol}</span>
                            <span>{PLANET_GLYPHS[aspect.point2.name] || aspect.point2.label}</span>
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
    </main>
  )
}
