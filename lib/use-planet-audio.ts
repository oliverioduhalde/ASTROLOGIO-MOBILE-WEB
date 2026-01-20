"use client"

import { useEffect, useRef, useCallback, useState } from "react"

interface AudioTrack {
  audioContext: AudioContext
  source: AudioBufferSourceNode
  startTime: number
  endTime: number
  planetName: string
  basePlaybackRate?: number
  baseGain?: number
  gainNode?: GainNode
  kind?: "planet" | "aspect" | "element"
  panner?: any
}

interface AudioEnvelope {
  fadeIn: number
  fadeOut: number
  backgroundVolume?: number
  aspectsSoundVolume?: number
  masterVolume?: number
  tuningCents?: number
  elementSoundVolume?: number
  dynAspectsFadeIn?: number
  dynAspectsSustain?: number
  dynAspectsFadeOut?: number
}

interface Position3D {
  x: number
  y: number
  z: number
}

interface PlanetData {
  name: string
  ChartPosition: {
    Ecliptic: {
      DecimalDegrees: number
    }
    Horizon: {
      DecimalDegrees: number
    }
  }
  declination?: number
}

function polarToCartesian3D(azimuthDeg: number, elevationDeg: number): Position3D {
  const distance = 5
  const azimuthRad = (azimuthDeg * Math.PI) / 180
  const elevationRad = (elevationDeg * Math.PI) / 180

  return {
    x: distance * Math.sin(azimuthRad) * Math.cos(elevationRad),
    z: distance * Math.cos(azimuthRad) * Math.cos(elevationRad),
    y: distance * Math.sin(elevationRad),
  }
}

// Calculate playbackRate based on zodiacal position
// Notes in order of fifths anchored to C3:
// C3, G2, D3, A2, E3, B2, F#3, C#3, G#2, D#3, A#2, F3
function getPlaybackRateFromZodiacPosition(eclipticDegrees: number): number {
  const notesInFifths = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5] // Semitones from C3

  // Get zodiac sign (0-11)
  const signIndex = Math.floor(eclipticDegrees / 30) % 12
  const positionInSign = eclipticDegrees % 30 // 0-30 degrees within sign
  
  // Get note for this sign
  const noteOffset = notesInFifths[signIndex]
  
  // Add microtonal variation within the sign (0-1 semitone spread across 30 degrees)
  const microtonalOffset = (positionInSign / 30) * 1
  
  // Total semitones from Do3 (C3)
  const totalSemitones = noteOffset + microtonalOffset
  
  // Convert semitones to playbackRate (each semitone = 2^(1/12))
  const playbackRate = Math.pow(2, totalSemitones / 12)
  
  return playbackRate
}

function getElementFromEclipticDegrees(eclipticDegrees: number): "fire" | "earth" | "air" | "water" {
  const signIndex = Math.floor(eclipticDegrees / 30) % 12
  const elements = ["fire", "earth", "air", "water"] as const
  return elements[signIndex % 4]
}

function centsToPlaybackRate(cents: number): number {
  return Math.pow(2, cents / 1200)
}

export function usePlanetAudio(
  envelope: AudioEnvelope = { fadeIn: 7, fadeOut: 7, backgroundVolume: 20, aspectsSoundVolume: 33, masterVolume: 100 },
) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBuffersRef = useRef<Record<string, AudioBuffer>>({})
  const activeTracksRef = useRef<Map<string, AudioTrack>>(new Map())
  const playingPlanetsRef = useRef<Set<string>>(new Set())
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const resonanceSceneRef = useRef<any>(null)

  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingLabel, setLoadingLabel] = useState("Inicializando audio")
  const [audioLevel, setAudioLevel] = useState(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)

  const backgroundSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const backgroundGainRef = useRef<GainNode | null>(null)
  const backgroundBufferRef = useRef<AudioBuffer | null>(null)
  const backgroundVolumeRef = useRef(envelope.backgroundVolume || 20)
  const aspectsSoundVolumeRef = useRef(envelope.aspectsSoundVolume || 33)
  const masterVolumeRef = useRef(envelope.masterVolume || 100)
  const tuningCentsRef = useRef(envelope.tuningCents || 0)
  const elementSoundVolumeRef = useRef(envelope.elementSoundVolume || 40)
  const masterGainNodeRef = useRef<GainNode | null>(null)
  const dynAspectsFadeInRef = useRef(envelope.dynAspectsFadeIn || 3)
  const dynAspectsSustainRef = useRef(envelope.dynAspectsSustain || 2)
  const dynAspectsFadeOutRef = useRef(envelope.dynAspectsFadeOut || 15)

  useEffect(() => {
    backgroundVolumeRef.current = envelope.backgroundVolume || 20
    if (backgroundGainRef.current) {
      backgroundGainRef.current.gain.value = (envelope.backgroundVolume || 30) / 100
    }
  }, [envelope.backgroundVolume])

  useEffect(() => {
    tuningCentsRef.current = envelope.tuningCents || 0
  }, [envelope.tuningCents])

  useEffect(() => {
    elementSoundVolumeRef.current = envelope.elementSoundVolume || 40
  }, [envelope.elementSoundVolume])

  useEffect(() => {
    const elementGain = elementSoundVolumeRef.current / 100
    activeTracksRef.current.forEach((track) => {
      if (track.kind === "element" && track.gainNode) {
        track.baseGain = elementGain
        track.gainNode.gain.setTargetAtTime(elementGain, track.audioContext.currentTime, 0.05)
      }
    })
  }, [envelope.elementSoundVolume])

  useEffect(() => {
    const tunedRate = centsToPlaybackRate(tuningCentsRef.current)
    activeTracksRef.current.forEach((track) => {
      if (track.basePlaybackRate !== undefined) {
        track.source.playbackRate.value = track.basePlaybackRate * tunedRate
      }
    })
  }, [envelope.tuningCents])

  useEffect(() => {
    aspectsSoundVolumeRef.current = envelope.aspectsSoundVolume || 33
  }, [envelope.aspectsSoundVolume])

  useEffect(() => {
    dynAspectsFadeInRef.current = envelope.dynAspectsFadeIn || 3
    dynAspectsSustainRef.current = envelope.dynAspectsSustain || 2
    dynAspectsFadeOutRef.current = envelope.dynAspectsFadeOut || 15
  }, [envelope.dynAspectsFadeIn, envelope.dynAspectsSustain, envelope.dynAspectsFadeOut])

  useEffect(() => {
    const vol = envelope.masterVolume !== undefined ? envelope.masterVolume : 100
    masterVolumeRef.current = vol
    if (masterGainNodeRef.current) {
      // 28 dB base gain (18dB + 10dB) * masterVolume (0-100%)
      const baseGain = Math.pow(10, 28 / 20) // 28 dB = 25.1x
      masterGainNodeRef.current.gain.value = baseGain * (vol / 100)
    }
  }, [envelope.masterVolume])

  // VU Meter update loop - 50ms refresh rate, stereo
  useEffect(() => {
    let intervalId: NodeJS.Timeout
    
    const updateVuMeter = () => {
      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current)
        const sum = dataArrayRef.current.reduce((acc, val) => acc + val, 0)
        const average = sum / dataArrayRef.current.length
        // Convert to dBFS (0-255 to -60dB to 0dB range)
        const normalizedLevel = average / 255
        const dbfs = normalizedLevel > 0 ? 20 * Math.log10(normalizedLevel) : -60
        // Convert dBFS to percentage (0-100) where -60dB = 0%, 0dB = 100%
        const percentage = Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100))
        setAudioLevel(percentage)
      }
      // Update every 50ms instead of using requestAnimationFrame
      intervalId = setTimeout(updateVuMeter, 50)
    }
    
    updateVuMeter()
    
    return () => {
      if (intervalId) {
        clearTimeout(intervalId)
      }
    }
  }, [])

  const initializeAudio = useCallback(async () => {
    if (initPromiseRef.current) return initPromiseRef.current

    initPromiseRef.current = (async () => {
      try {
        setLoadingLabel("Inicializando audio")
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
          console.log("[v0] AudioContext created")

          if (!(window as any).ResonanceAudio) {
            setLoadingLabel("Cargando motor 3D")
            const script = document.createElement("script")
            script.src = "https://cdn.jsdelivr.net/npm/resonance-audio/build/resonance-audio.min.js"
            script.async = true
            document.head.appendChild(script)

            await new Promise((resolve) => {
              script.onload = resolve
            })
          }

          resonanceSceneRef.current = new (window as any).ResonanceAudio(audioContextRef.current)

          const masterGainNode = audioContextRef.current.createGain()
          const baseGain = Math.pow(10, 28 / 20) // 28 dB = 25.1x gain (18dB base + 10dB extra)
          masterGainNode.gain.value = baseGain * (masterVolumeRef.current / 100)
          masterGainNodeRef.current = masterGainNode

          const dynamicsCompressor = audioContextRef.current.createDynamicsCompressor()
          dynamicsCompressor.threshold.value = -1
          dynamicsCompressor.knee.value = 0
          dynamicsCompressor.ratio.value = 4
          dynamicsCompressor.attack.value = 0.003
          dynamicsCompressor.release.value = 0.25

          const analyser = audioContextRef.current.createAnalyser()
          analyser.fftSize = 256
          analyserRef.current = analyser
          dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount)

          resonanceSceneRef.current.output.connect(masterGainNode)
          masterGainNode.connect(dynamicsCompressor)
          dynamicsCompressor.connect(analyser)
          analyser.connect(audioContextRef.current.destination)

          resonanceSceneRef.current.setListenerPosition(0, 0, 0)
          console.log("[v0] Resonance Audio scene initialized with 18dB gain and limiter")
        }

        const planetAudioMap = {
          sun: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/01%20SUN%20ADN-J5pCD5YXQM03r4vktr2y5yUh3W7Jz4.mp3",
          moon: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/02%20MOON%20ADN-r0bDnTr3lRhOnV5lNFRDGPDocVBiSd.mp3",
          mercury: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/03%20MERCURY%20ADN-tEr5fQwvG8YwEAicwfsXbLOeRxW0id.mp3",
          venus: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/04%20VENUS%20ADN-v47D1k0TcHtR49kwHs7MAjkqPQIiMr.mp3",
          mars: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/05%20MARS%20ADN-oClVSlw80vrzmakuJsdtpUnWX4VTHg.mp3",
          jupiter: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/06%20JUPITER%20ADN-DMMtzeboD1m7HeiXKhjT5u47Oo61Pr.mp3",
          saturn: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/07%20SATURN%20ADN-f7b2UIOtjEzzFqVXefAShqNYROgBuy.mp3",
          uranus: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/08%20URANUS%20ADN-Io0XOWbtZuFDRjWLnbDGZ6dKe3nkOm.mp3",
          neptune: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/09%20NEPTUNE%20ADN-EwwPfIaUulNxd9IU3Gd31VCrWZFL1H.mp3",
          pluto: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/10%20PLUTO%20ADN-OhFEfWgCc2b4F9eEtzAvTNh0No6129.mp3",
        }

        const elementAudioMap = {
          fire: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/01%20FIRE-8eUGRrVxNyhSJ1b36TFi2k8M85hiup.mp3",
          earth: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/02%20EARTH-OcMQF04mhLvN00VAVJukOGlFOruvnP.mp3",
          air: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/03%20AIR-CU33ZNjx6mwjmMXUkdxAvKlOGk4B1t.mp3",
          water: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/04%20WATER-GNcvuoJGsQNHQkZ6Z8Ta7ww3Gtzb1P.mp3",
        }

        const allAudios = [
          ...Object.entries(planetAudioMap),
          ["background", "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ASTROLOG%20FONDO%20ARIES%2044.1-1OFwQVOhZga6hl7H99PNa1gBlDxMA7.mp3"],
          ...Object.entries(elementAudioMap),
        ]

        const audioLabels: Record<string, string> = {
          sun: "Sol",
          moon: "Luna",
          mercury: "Mercurio",
          venus: "Venus",
          mars: "Marte",
          jupiter: "Jupiter",
          saturn: "Saturno",
          uranus: "Urano",
          neptune: "Neptuno",
          pluto: "Pluton",
          background: "Fondo",
          fire: "Fuego",
          earth: "Tierra",
          air: "Aire",
          water: "Agua",
        }

        let loadedCount = 0

        const loadAudioPromises = allAudios.map(async ([name, url]) => {
          try {
            setLoadingLabel(`Cargando ${audioLabels[name] || name}`)
            console.log(`[v0] Fetching audio: ${name} from URL: ${url}`)
            let response = await fetch(url, { mode: 'cors' })
            
            // If CORS fails, try without mode
            if (!response.ok) {
              console.log(`[v0] First fetch attempt failed with status ${response.status}, retrying...`)
              response = await fetch(url)
            }
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`)
            }
            const arrayBuffer = await response.arrayBuffer()
            console.log(`[v0] Downloaded ${name} - buffer size: ${arrayBuffer.byteLength} bytes`)

            if (arrayBuffer.byteLength === 0) {
              throw new Error("Empty audio file")
            }

            const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer)
            audioBuffersRef.current[name] = audioBuffer
            console.log(`[v0] Successfully loaded audio for ${name} - duration: ${audioBuffer.duration}s`)

            loadedCount++
            setLoadingProgress(Math.round((loadedCount / allAudios.length) * 100))
          } catch (error) {
            console.error(`[v0] Failed to load audio for ${name}:`, error)
            loadedCount++
            setLoadingProgress(Math.round((loadedCount / allAudios.length) * 100))
          }
        })

        await Promise.all(loadAudioPromises)

        backgroundBufferRef.current = audioBuffersRef.current["background"] || null

        setLoadingLabel("Finalizando")
        setLoadingProgress(100)
      } catch (error) {
        console.error("[v0] Audio initialization failed:", error)
        setLoadingLabel("Listo")
        setLoadingProgress(100)
      }
    })()

    return initPromiseRef.current
  }, [])

  const playBackgroundSound = useCallback(async () => {
    await initializeAudio()

    if (!audioContextRef.current || !backgroundBufferRef.current) {
      console.log("[v0] Background audio not ready")
      return
    }

    try {
      const ctx = audioContextRef.current

      backgroundGainRef.current = ctx.createGain()
      backgroundGainRef.current.gain.value = (envelope.backgroundVolume || 30) / 100

      backgroundSourceRef.current = ctx.createBufferSource()
      backgroundSourceRef.current.buffer = backgroundBufferRef.current
      backgroundSourceRef.current.loop = true

      backgroundSourceRef.current.connect(backgroundGainRef.current)
      backgroundGainRef.current.connect(ctx.destination)

      backgroundSourceRef.current.start(0)
      console.log("[v0] Background sound started")
    } catch (error) {
      console.error("[v0] Error playing background sound:", error)
    }
  }, [envelope.backgroundVolume, initializeAudio])

  const stopBackgroundSound = useCallback(() => {
    if (backgroundSourceRef.current && backgroundGainRef.current) {
      try {
        const ctx = audioContextRef.current
        if (!ctx) return

        const FADE_OUT_TIME = 15
        const currentTime = ctx.currentTime

        backgroundGainRef.current.gain.setValueAtTime(backgroundGainRef.current.gain.value, currentTime)
        backgroundGainRef.current.gain.linearRampToValueAtTime(0, currentTime + FADE_OUT_TIME)

        setTimeout(() => {
          if (backgroundSourceRef.current) {
            try {
              backgroundSourceRef.current.stop()
              backgroundSourceRef.current = null
              console.log("[v0] Background sound stopped after fade out")
            } catch (e) {
              // Already stopped
            }
          }
        }, FADE_OUT_TIME * 1000)
      } catch (error) {
        console.error("[v0] Error stopping background sound:", error)
      }
    }
  }, [])

  const playPlanetSound = useCallback(
    async (
      planetName: string,
      pointerAngleDeg = 180,
      planetDeclinationDeg = 0,
      aspects: any[] = [],
      planets: PlanetData[] = [],
      ascendantDegrees = 0,
      mcDegrees = 0,
      aspectVolumeOverride?: number,
    ) => {
      await initializeAudio()

      if (playingPlanetsRef.current.has(planetName)) {
        console.log(`[v0] Planet ${planetName} is already playing`)
        return
      }

      if (activeTracksRef.current.size >= 15) {
        console.log(`[v0] Max polyphony reached (15 sounds)`)
        return
      }

      const audioBuffer = audioBuffersRef.current[planetName]
      if (!audioBuffer || !audioContextRef.current) {
        console.log(`[v0] No audio buffer for ${planetName}`)
        return
      }

      const ctx = audioContextRef.current

      const startOffset = 30

      if (startOffset >= audioBuffer.duration) {
        console.log(`[v0] Start offset ${startOffset}s exceeds buffer duration ${audioBuffer.duration}s`)
        return
      }

      try {
        const azimuth = (pointerAngleDeg + 90) % 360 // Adjust for ambisonics coordinate system
        const elevation = planetDeclinationDeg * 5

        console.log(`[v0] Playing sound for ${planetName} at azimuth ${azimuth}°, elevation ${elevation}°`)

        const source = ctx.createBufferSource() as AudioBufferSourceNode
        source.buffer = audioBuffer

        // Get playback rate based on zodiacal position
        const planetData = planets.find((p) => p.name === planetName)
        let basePlaybackRate = 1.0
        if (planetData && planetData.ChartPosition?.Ecliptic?.DecimalDegrees !== undefined) {
          const eclipticDegrees = planetData.ChartPosition.Ecliptic.DecimalDegrees
          basePlaybackRate = getPlaybackRateFromZodiacPosition(eclipticDegrees)
          console.log(`[v0] ${planetName} at ${eclipticDegrees}° - basePlaybackRate: ${basePlaybackRate.toFixed(4)}`)
        }
        const tunedPlaybackRate = basePlaybackRate * centsToPlaybackRate(tuningCentsRef.current)
        source.playbackRate.value = tunedPlaybackRate

        if (!resonanceSceneRef.current || !resonanceSceneRef.current.output) {
          console.error("[v0] Resonance Audio scene not properly initialized")
          return
        }

        const panner = resonanceSceneRef.current.createSource()

        const gainNode = ctx.createGain()

        source.connect(gainNode)
        gainNode.connect(panner.input)

        const position = polarToCartesian3D(azimuth, elevation)
        panner.setPosition(position.x, position.y, position.z)

        console.log(
          `[v0] 3D position - x: ${position.x.toFixed(2)}, y: ${position.y.toFixed(2)}, z: ${position.z.toFixed(2)}`,
        )

        const fadeInTime = Number.isFinite(envelope.fadeIn) ? envelope.fadeIn : 7
        const fadeOutTime = Number.isFinite(envelope.fadeOut) ? envelope.fadeOut : 7

        if (!Number.isFinite(fadeInTime) || !Number.isFinite(fadeOutTime)) {
          console.error(`[v0] Invalid envelope times for ${planetName}: fadeIn=${fadeInTime}, fadeOut=${fadeOutTime}`)
          return
        }

        const totalDuration = fadeInTime + fadeOutTime

        const currentTime = ctx.currentTime

        gainNode.gain.setValueAtTime(0, currentTime)
        gainNode.gain.linearRampToValueAtTime(1, currentTime + fadeInTime)

        gainNode.gain.setValueAtTime(1, currentTime + fadeInTime)
        gainNode.gain.linearRampToValueAtTime(0, currentTime + totalDuration)

        source.start(currentTime, startOffset)

        const endTime = currentTime + totalDuration

        const trackId = `${planetName}-${currentTime}`
        activeTracksRef.current.set(trackId, {
          audioContext: ctx,
          source,
          startTime: currentTime,
          endTime,
          planetName,
          basePlaybackRate,
          kind: "planet",
          panner,
        })

        playingPlanetsRef.current.add(planetName)

        if (aspects && aspects.length > 0) {
          // Play aspects with inherited playbackRate (zodiacal note of main planet)
          for (const aspect of aspects) {
            const otherPlanetName = aspect.point1.name === planetName ? aspect.point2.name : aspect.point1.name

            if (aspect.aspectType === "Conjunción") continue

            const otherAudioBuffer = audioBuffersRef.current[otherPlanetName.toLowerCase()]
            if (!otherAudioBuffer) continue

            let otherPlanetDegrees: number | null = null
            let otherPlanetDeclination = 0

            if (otherPlanetName.toLowerCase() === "asc") {
              otherPlanetDegrees = ascendantDegrees
            } else if (otherPlanetName.toLowerCase() === "mc") {
              otherPlanetDegrees = mcDegrees
            } else {
              const otherPlanet = planets.find((p) => p.name.toLowerCase() === otherPlanetName.toLowerCase())
              if (otherPlanet) {
                otherPlanetDegrees = otherPlanet.ChartPosition.Ecliptic.DecimalDegrees
                otherPlanetDeclination = otherPlanet.declination || 0
              }
            }

            if (otherPlanetDegrees === null) continue

            // Don't use aspect-specific pitch shifts anymore
            // Aspects now inherit the main planet's zodiacal note


            // Aspects inherit the zodiacal note (playbackRate) of the main planet
            // No additional pitch shift applied, just the main planet's note
            const aspectPlaybackRate = basePlaybackRate * centsToPlaybackRate(tuningCentsRef.current)

            const aspectSource = ctx.createBufferSource() as AudioBufferSourceNode
            aspectSource.buffer = otherAudioBuffer
            aspectSource.playbackRate.value = aspectPlaybackRate

            const aspectPanner = resonanceSceneRef.current.createSource()
            const aspectPosition = polarToCartesian3D(otherPlanetDegrees, otherPlanetDeclination * 5)
            aspectPanner.setPosition(aspectPosition.x, aspectPosition.y, aspectPosition.z)

            const aspectGainNode = ctx.createGain()
            aspectSource.connect(aspectGainNode)
            aspectGainNode.connect(aspectPanner.input)

            const aspectVolume =
              typeof aspectVolumeOverride === "number" ? aspectVolumeOverride : aspectsSoundVolumeRef.current
            const baseVolume = 0.33 * (aspectVolume / 100)

            // Use dynAspects times instead of planet times
            const aspectFadeInTime = dynAspectsFadeInRef.current
            const aspectSustainTime = dynAspectsSustainRef.current
            const aspectFadeOutTime = dynAspectsFadeOutRef.current
            
            const aspectStartTime = currentTime
            const aspectFadeInEnd = aspectStartTime + aspectFadeInTime
            const aspectSustainEnd = aspectFadeInEnd + aspectSustainTime
            const aspectFadeOutEnd = aspectSustainEnd + aspectFadeOutTime
            
            const aspectEndTime = aspectFadeOutEnd

            aspectGainNode.gain.setValueAtTime(0, aspectStartTime)
            aspectGainNode.gain.linearRampToValueAtTime(baseVolume, aspectFadeInEnd)
            aspectGainNode.gain.setValueAtTime(baseVolume, aspectSustainEnd)
            aspectGainNode.gain.linearRampToValueAtTime(0, aspectFadeOutEnd)

            aspectSource.start(currentTime, startOffset)

            const aspectTrackId = `${planetName}-aspect-${otherPlanetName}-${currentTime}`
            activeTracksRef.current.set(aspectTrackId, {
              audioContext: ctx,
              source: aspectSource,
              startTime: aspectStartTime,
              endTime: aspectFadeOutEnd,
              planetName: `${planetName}-aspect`,
              basePlaybackRate,
              kind: "aspect",
              panner: aspectPanner,
            })

            const checkInterval = setInterval(() => {
              if (ctx.currentTime >= aspectFadeOutEnd) {
                clearInterval(checkInterval)
                activeTracksRef.current.delete(aspectTrackId)
                try {
                  aspectSource.stop()
                } catch (e) {
                  // Already stopped
                }
              }
            }, 100)

            const elementKey = getElementFromEclipticDegrees(otherPlanetDegrees)
            const elementAudioBuffer = audioBuffersRef.current[elementKey]
            if (elementAudioBuffer) {
              const elementSource = ctx.createBufferSource() as AudioBufferSourceNode
              elementSource.buffer = elementAudioBuffer

              const elementPanner = resonanceSceneRef.current.createSource()
              elementPanner.setPosition(aspectPosition.x, aspectPosition.y, aspectPosition.z)

              const elementGainNode = ctx.createGain()
              elementSource.connect(elementGainNode)
              elementGainNode.connect(elementPanner.input)

              const elementVolume = elementSoundVolumeRef.current / 100
              elementGainNode.gain.setValueAtTime(0, aspectStartTime)
              elementGainNode.gain.linearRampToValueAtTime(elementVolume, aspectFadeInEnd)
              elementGainNode.gain.setValueAtTime(elementVolume, aspectSustainEnd)
              elementGainNode.gain.linearRampToValueAtTime(0, aspectFadeOutEnd)

              elementSource.start(currentTime, startOffset)

              const elementTrackId = `${planetName}-element-${otherPlanetName}-${currentTime}`
              activeTracksRef.current.set(elementTrackId, {
                audioContext: ctx,
                source: elementSource,
                startTime: aspectStartTime,
                endTime: aspectFadeOutEnd,
                planetName: `${planetName}-element`,
                basePlaybackRate: 1,
                baseGain: elementVolume,
                gainNode: elementGainNode,
                kind: "element",
                panner: elementPanner,
              })

              const elementCheckInterval = setInterval(() => {
                if (ctx.currentTime >= aspectFadeOutEnd) {
                  clearInterval(elementCheckInterval)
                  activeTracksRef.current.delete(elementTrackId)
                  try {
                    elementSource.stop()
                  } catch (e) {
                    // Already stopped
                  }
                }
              }, 100)
            }
          }
        }

        const checkInterval = setInterval(() => {
          if (ctx.currentTime >= endTime) {
            clearInterval(checkInterval)
            activeTracksRef.current.delete(trackId)
            playingPlanetsRef.current.delete(planetName)
            try {
              source.stop()
            } catch (e) {
              // Already stopped
            }
          }
        }, 100)
      } catch (error) {
        console.error(`[v0] Error playing sound for ${planetName}:`, error)
      }
    },
    [envelope.fadeIn, envelope.fadeOut, initializeAudio],
  )

  const stopAll = useCallback(() => {
    activeTracksRef.current.forEach((track) => {
      try {
        track.source.stop()
      } catch (e) {
        // Already stopped
      }
    })
    activeTracksRef.current.clear()
    playingPlanetsRef.current.clear()
  }, [])

  useEffect(() => {
    initializeAudio()
  }, [initializeAudio])

  useEffect(() => {
    return () => {
      stopAll()
      stopBackgroundSound()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [stopAll, stopBackgroundSound])

  useEffect(() => {
    if (analyserRef.current && dataArrayRef.current) {
      const analyser = analyserRef.current
      const dataArray = dataArrayRef.current

      const updateAudioLevel = () => {
        analyser.getByteTimeDomainData(dataArray)
        const sum = dataArray.reduce((acc, val) => acc + val, 0)
        const average = sum / dataArray.length
        setAudioLevel(average)
      }

      const interval = setInterval(updateAudioLevel, 100)
      return () => clearInterval(interval)
    }
  }, [])

  return { playPlanetSound, stopAll, playBackgroundSound, stopBackgroundSound, loadingProgress, loadingLabel, audioLevel }
}
