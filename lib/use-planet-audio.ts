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

type AudioEngineMode = "samples" | "hybrid" | "fm_pad"

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
  modalEnabled?: boolean
  modalSunSignIndex?: number | null
  audioEngineMode?: AudioEngineMode
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

const LEGACY_PLANET_SEMITONE_OFFSETS: Record<string, number> = {
  pluto: 0, // C4
  saturn: 2, // D4
  neptune: 4, // E4
  jupiter: 5, // F4
  moon: 9, // A4
  venus: 11, // B4
  sun: 12, // C5
  mars: 14, // D5
  mercury: 16, // E5
  uranus: 19, // G5
}

// Sign index: Aries=0 ... Pisces=11
const SIGN_MODE_PCS: Record<number, number[]> = {
  0: [0, 1, 4, 5, 7, 8, 10], // Aries - Frigio dominante
  1: [0, 2, 3, 5, 7, 9, 10], // Tauro - Dórico
  2: [0, 2, 4, 6, 7, 9, 11], // Géminis - Lidio
  3: [0, 2, 3, 5, 7, 8, 10], // Cáncer - Eólico
  4: [0, 2, 4, 5, 7, 9, 11], // Leo - Jónico
  5: [0, 2, 3, 5, 7, 8, 10], // Virgo - Eólico
  6: [0, 2, 4, 5, 7, 9, 11], // Libra - Jónico
  7: [0, 1, 3, 5, 7, 8, 10], // Escorpio - Frigio
  8: [0, 2, 4, 5, 7, 9, 10], // Sagitario - Mixolidio
  9: [0, 2, 3, 5, 7, 8, 11], // Capricornio - Menor armónico
  10: [0, 2, 4, 6, 7, 9, 10], // Acuario - Lidio dominante
  11: [0, 1, 3, 5, 6, 8, 10], // Piscis - Locrio
}

const SIGN_PLANET_PROXIMITY: Record<number, string[]> = {
  0: ["mars", "pluto", "sun", "jupiter", "mercury", "venus", "uranus", "saturn", "moon", "neptune"], // Aries
  1: ["venus", "moon", "saturn", "mercury", "jupiter", "mars", "neptune", "pluto", "uranus", "sun"], // Tauro
  2: ["mercury", "uranus", "jupiter", "venus", "moon", "mars", "neptune", "saturn", "pluto", "sun"], // Géminis
  3: ["moon", "neptune", "venus", "jupiter", "mercury", "pluto", "saturn", "mars", "uranus", "sun"], // Cáncer
  4: ["sun", "jupiter", "mars", "venus", "mercury", "saturn", "pluto", "uranus", "neptune", "moon"], // Leo
  5: ["mercury", "saturn", "moon", "venus", "jupiter", "mars", "neptune", "uranus", "pluto", "sun"], // Virgo
  6: ["venus", "saturn", "moon", "mercury", "jupiter", "neptune", "mars", "uranus", "pluto", "sun"], // Libra
  7: ["mars", "pluto", "neptune", "saturn", "venus", "moon", "mercury", "jupiter", "uranus", "sun"], // Escorpio
  8: ["jupiter", "mars", "sun", "mercury", "uranus", "venus", "saturn", "moon", "neptune", "pluto"], // Sagitario
  9: ["saturn", "mars", "pluto", "venus", "mercury", "jupiter", "moon", "neptune", "uranus", "sun"], // Capricornio
  10: ["saturn", "uranus", "mercury", "jupiter", "venus", "mars", "moon", "neptune", "pluto", "sun"], // Acuario
  11: ["jupiter", "neptune", "moon", "venus", "mercury", "pluto", "saturn", "mars", "uranus", "sun"], // Piscis
}

// Proximity -> harmonic target interval (semitones from fundamental)
const INTERVAL_TARGET_BY_PROXIMITY = [0, 7, 5, 4, 3, 9, 8, 2, 10, 11, 1, 6]
const CONSONANCE_PRIORITY = INTERVAL_TARGET_BY_PROXIMITY
const DEFAULT_SYSTEM_OCTAVE_SHIFT_SEMITONES = -24 // Two octaves down by default
const ASPECT_SEMITONE_OFFSETS: Record<string, number> = {
  Conjunción: 0,
  Oposición: 14,
  Cuadrado: 6,
  Cuadratura: 6,
  Trígono: 7,
  Sextil: 5,
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12
}

function getLegacyPlanetSemitoneOffset(planetName: string): number {
  return LEGACY_PLANET_SEMITONE_OFFSETS[planetName] ?? 0
}

function getConsonanceRank(pc: number): number {
  const idx = CONSONANCE_PRIORITY.indexOf(mod12(pc))
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function circularDistancePc(a: number, b: number): number {
  const diff = Math.abs(mod12(a) - mod12(b))
  return Math.min(diff, 12 - diff)
}

function findClosestPitchClassByConsonance(targetPc: number, pcs: number[]): number {
  if (!pcs || pcs.length === 0) return mod12(targetPc)

  const normalizedTarget = mod12(targetPc)
  return pcs
    .map((pc) => mod12(pc))
    .sort((a, b) => {
      const da = circularDistancePc(a, normalizedTarget)
      const db = circularDistancePc(b, normalizedTarget)
      if (da !== db) return da - db

      // Tie-break toward the most consonant option
      const ca = getConsonanceRank(a)
      const cb = getConsonanceRank(b)
      if (ca !== cb) return ca - cb

      return a - b
    })[0]
}

function getModalPlanetSemitoneOffset(planetName: string, sunSignIndex: number): number {
  const signIdx = mod12(sunSignIndex)
  const proximity = SIGN_PLANET_PROXIMITY[signIdx]
  const pcs = SIGN_MODE_PCS[signIdx]
  if (!proximity || !pcs) return getLegacyPlanetSemitoneOffset(planetName)

  const normalizedPlanet = planetName.toLowerCase()
  const proximityIndex = proximity.indexOf(normalizedPlanet)
  if (proximityIndex === -1) return getLegacyPlanetSemitoneOffset(normalizedPlanet)

  const targetInterval = INTERVAL_TARGET_BY_PROXIMITY[proximityIndex] ?? INTERVAL_TARGET_BY_PROXIMITY[0]
  const resolvedInterval = pcs.includes(targetInterval)
    ? targetInterval
    : findClosestPitchClassByConsonance(targetInterval, pcs)

  // Root is fixed by sign; keep planet legacy octave register to preserve spacing.
  const legacySemitone = getLegacyPlanetSemitoneOffset(normalizedPlanet)
  const legacyOctave = Math.floor(legacySemitone / 12)
  const signRootPc = signIdx
  return signRootPc + resolvedInterval + legacyOctave * 12
}

function getPlanetPrincipalSemitoneOffset(planetName: string, modalEnabled: boolean, sunSignIndex: number | null): number {
  const normalized = planetName.toLowerCase()
  return (
    modalEnabled && sunSignIndex !== null
      ? getModalPlanetSemitoneOffset(normalized, sunSignIndex)
      : getLegacyPlanetSemitoneOffset(normalized)
  )
}

function getPlanetPrincipalPlaybackRate(planetName: string, modalEnabled: boolean, sunSignIndex: number | null): number {
  const semitones = getPlanetPrincipalSemitoneOffset(planetName, modalEnabled, sunSignIndex)

  return Math.pow(2, (semitones + DEFAULT_SYSTEM_OCTAVE_SHIFT_SEMITONES) / 12)
}

function getSignRulerPlanetName(sunSignIndex: number | null): string {
  if (sunSignIndex === null) return "sun"
  const proximity = SIGN_PLANET_PROXIMITY[mod12(sunSignIndex)]
  return proximity?.[0] ?? "sun"
}

function getPlanetVolumeMultiplier(planetName: string): number {
  const normalized = planetName.toLowerCase()
  const volumeMultipliers: Record<string, number> = {
    sun: 1.2, // +20%
    pluto: 1.25, // +25%
    mercury: 0.8, // -20%
    neptune: 1.2, // +20%
  }

  return volumeMultipliers[normalized] ?? 1
}

function createLowDiffusionReverbImpulse(ctx: AudioContext, durationSeconds = 3): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds))
  const impulse = ctx.createBuffer(1, length, sampleRate)
  const data = impulse.getChannelData(0)

  for (let i = 0; i < length; i++) {
    data[i] = 0
  }

  // Sparse taps for low diffusion + linear decay envelope over 3 seconds.
  const tapSpacingSamples = Math.max(1, Math.floor(sampleRate * 0.011))
  for (let i = 0; i < length; i += tapSpacingSamples) {
    const t = i / (length - 1)
    const linearDecay = 1 - t
    const noise = (Math.random() * 2 - 1) * 0.32
    data[i] = noise * linearDecay
    if (i + 1 < length) {
      data[i + 1] = noise * 0.5 * linearDecay
    }
  }

  return impulse
}

function centsToPlaybackRate(cents: number): number {
  return Math.pow(2, cents / 1200)
}

export function usePlanetAudio(
  envelope: AudioEnvelope = { fadeIn: 7, fadeOut: 7, backgroundVolume: 20, aspectsSoundVolume: 33, masterVolume: 20 },
) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBuffersRef = useRef<Record<string, AudioBuffer>>({})
  const activeTracksRef = useRef<Map<string, AudioTrack>>(new Map())
  const playingPlanetsRef = useRef<Set<string>>(new Set())
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const resonanceSceneRef = useRef<any>(null)

  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingLabel, setLoadingLabel] = useState("Inicializando audio")
  const [audioLevelLeftPre, setAudioLevelLeftPre] = useState(0)
  const [audioLevelRightPre, setAudioLevelRightPre] = useState(0)
  const [audioLevelLeftPost, setAudioLevelLeftPost] = useState(0)
  const [audioLevelRightPost, setAudioLevelRightPost] = useState(0)
  const [compressionReductionDb, setCompressionReductionDb] = useState(0)
  const preLeftAnalyserRef = useRef<AnalyserNode | null>(null)
  const preRightAnalyserRef = useRef<AnalyserNode | null>(null)
  const postLeftAnalyserRef = useRef<AnalyserNode | null>(null)
  const postRightAnalyserRef = useRef<AnalyserNode | null>(null)
  const preLeftDataArrayRef = useRef<Uint8Array | null>(null)
  const preRightDataArrayRef = useRef<Uint8Array | null>(null)
  const postLeftDataArrayRef = useRef<Uint8Array | null>(null)
  const postRightDataArrayRef = useRef<Uint8Array | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)

  const backgroundSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const backgroundGainRef = useRef<GainNode | null>(null)
  const backgroundBufferRef = useRef<AudioBuffer | null>(null)
  const elementBackgroundSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const elementBackgroundGainRef = useRef<GainNode | null>(null)
  const elementBackgroundNextSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const elementBackgroundNextGainRef = useRef<GainNode | null>(null)
  const elementBackgroundTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const backgroundVolumeRef = useRef(envelope.backgroundVolume || 20)
  const aspectsSoundVolumeRef = useRef(envelope.aspectsSoundVolume || 33)
  const masterVolumeRef = useRef(envelope.masterVolume || 20)
  const tuningCentsRef = useRef(envelope.tuningCents || 0)
  const elementSoundVolumeRef = useRef(envelope.elementSoundVolume ?? 40)
  const masterGainNodeRef = useRef<GainNode | null>(null)
  const planetReverbImpulseRef = useRef<AudioBuffer | null>(null)
  const dynAspectsFadeInRef = useRef(envelope.dynAspectsFadeIn || 3)
  const dynAspectsSustainRef = useRef(envelope.dynAspectsSustain || 2)
  const dynAspectsFadeOutRef = useRef(envelope.dynAspectsFadeOut || 15)
  const modalEnabledRef = useRef(envelope.modalEnabled ?? true)
  const modalSunSignIndexRef = useRef<number | null>(
    typeof envelope.modalSunSignIndex === "number" ? envelope.modalSunSignIndex : null,
  )
  const audioEngineModeRef = useRef<AudioEngineMode>(envelope.audioEngineMode || "samples")
  const toneModuleRef = useRef<any>(null)
  const fmPadSynthRef = useRef<any>(null)
  const fmPadGainRef = useRef<any>(null)

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
    elementSoundVolumeRef.current = envelope.elementSoundVolume ?? 40
  }, [envelope.elementSoundVolume])

  useEffect(() => {
    const elementGain = elementSoundVolumeRef.current / 100
    if (elementBackgroundGainRef.current && audioContextRef.current) {
      elementBackgroundGainRef.current.gain.setTargetAtTime(elementGain, audioContextRef.current.currentTime, 0.05)
    }
    if (elementBackgroundNextGainRef.current && audioContextRef.current) {
      elementBackgroundNextGainRef.current.gain.setTargetAtTime(elementGain, audioContextRef.current.currentTime, 0.05)
    }
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
    modalEnabledRef.current = envelope.modalEnabled ?? true
  }, [envelope.modalEnabled])

  useEffect(() => {
    modalSunSignIndexRef.current =
      typeof envelope.modalSunSignIndex === "number" ? envelope.modalSunSignIndex : null
  }, [envelope.modalSunSignIndex])

  useEffect(() => {
    audioEngineModeRef.current = envelope.audioEngineMode || "samples"
  }, [envelope.audioEngineMode])

  useEffect(() => {
    const vol = envelope.masterVolume !== undefined ? envelope.masterVolume : 20
    masterVolumeRef.current = vol
    if (masterGainNodeRef.current) {
      // 28 dB base gain (18dB + 10dB) * masterVolume (0-100%)
      const baseGain = Math.pow(10, 28 / 20) // 28 dB = 25.1x
      masterGainNodeRef.current.gain.value = baseGain * (vol / 100)
    }
    if (fmPadGainRef.current?.gain) {
      const fmGain = Math.max(0, (vol / 100) * 0.22)
      if (typeof fmPadGainRef.current.gain.rampTo === "function") {
        fmPadGainRef.current.gain.rampTo(fmGain, 0.05)
      } else {
        fmPadGainRef.current.gain.value = fmGain
      }
    }
  }, [envelope.masterVolume])

  // VU Meter update loop - 50ms refresh rate, pre/post compression
  useEffect(() => {
    let intervalId: NodeJS.Timeout
    
    const updateVuMeter = () => {
      if (
        preLeftAnalyserRef.current &&
        preRightAnalyserRef.current &&
        postLeftAnalyserRef.current &&
        postRightAnalyserRef.current &&
        preLeftDataArrayRef.current &&
        preRightDataArrayRef.current &&
        postLeftDataArrayRef.current &&
        postRightDataArrayRef.current
      ) {
        const toDbfsPercent = (avg: number) => {
          const normalizedLevel = avg / 255
          const dbfs = normalizedLevel > 0 ? 20 * Math.log10(normalizedLevel) : -60
          return Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100))
        }

        preLeftAnalyserRef.current.getByteFrequencyData(preLeftDataArrayRef.current)
        preRightAnalyserRef.current.getByteFrequencyData(preRightDataArrayRef.current)
        postLeftAnalyserRef.current.getByteFrequencyData(postLeftDataArrayRef.current)
        postRightAnalyserRef.current.getByteFrequencyData(postRightDataArrayRef.current)

        const preLeftSum = preLeftDataArrayRef.current.reduce((acc, val) => acc + val, 0)
        const preRightSum = preRightDataArrayRef.current.reduce((acc, val) => acc + val, 0)
        const postLeftSum = postLeftDataArrayRef.current.reduce((acc, val) => acc + val, 0)
        const postRightSum = postRightDataArrayRef.current.reduce((acc, val) => acc + val, 0)

        const preLeftAverage = preLeftSum / preLeftDataArrayRef.current.length
        const preRightAverage = preRightSum / preRightDataArrayRef.current.length
        const postLeftAverage = postLeftSum / postLeftDataArrayRef.current.length
        const postRightAverage = postRightSum / postRightDataArrayRef.current.length

        setAudioLevelLeftPre(toDbfsPercent(preLeftAverage))
        setAudioLevelRightPre(toDbfsPercent(preRightAverage))
        setAudioLevelLeftPost(toDbfsPercent(postLeftAverage))
        setAudioLevelRightPost(toDbfsPercent(postRightAverage))

        if (compressorRef.current) {
          const reduction = Math.max(0, -compressorRef.current.reduction)
          setCompressionReductionDb(reduction)
        }
      }
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

          const preLeftAnalyser = audioContextRef.current.createAnalyser()
          const preRightAnalyser = audioContextRef.current.createAnalyser()
          const postLeftAnalyser = audioContextRef.current.createAnalyser()
          const postRightAnalyser = audioContextRef.current.createAnalyser()
          preLeftAnalyser.fftSize = 256
          preRightAnalyser.fftSize = 256
          postLeftAnalyser.fftSize = 256
          postRightAnalyser.fftSize = 256
          preLeftAnalyserRef.current = preLeftAnalyser
          preRightAnalyserRef.current = preRightAnalyser
          postLeftAnalyserRef.current = postLeftAnalyser
          postRightAnalyserRef.current = postRightAnalyser
          preLeftDataArrayRef.current = new Uint8Array(preLeftAnalyser.frequencyBinCount)
          preRightDataArrayRef.current = new Uint8Array(preRightAnalyser.frequencyBinCount)
          postLeftDataArrayRef.current = new Uint8Array(postLeftAnalyser.frequencyBinCount)
          postRightDataArrayRef.current = new Uint8Array(postRightAnalyser.frequencyBinCount)

          const preSplitter = audioContextRef.current.createChannelSplitter(2)
          const postSplitter = audioContextRef.current.createChannelSplitter(2)

          resonanceSceneRef.current.output.connect(masterGainNode)
          masterGainNode.connect(dynamicsCompressor)
          masterGainNode.connect(preSplitter)
          compressorRef.current = dynamicsCompressor
          dynamicsCompressor.connect(audioContextRef.current.destination)
          dynamicsCompressor.connect(postSplitter)
          preSplitter.connect(preLeftAnalyser, 0)
          preSplitter.connect(preRightAnalyser, 1)
          postSplitter.connect(postLeftAnalyser, 0)
          postSplitter.connect(postRightAnalyser, 1)

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
      const masterNode = masterGainNodeRef.current || ctx.destination
      backgroundGainRef.current.connect(masterNode)

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

  const playElementBackground = useCallback(
    async (
      primaryElement: "fire" | "earth" | "air" | "water",
      secondaryElement?: "fire" | "earth" | "air" | "water",
      crossfadeDelaySeconds = 0,
      crossfadeDurationSeconds = 30,
      pedalOptions?: { modalEnabled?: boolean; sunSignIndex?: number | null },
    ) => {
      await initializeAudio()

      const ctx = audioContextRef.current
      if (!ctx) return

      const primaryBuffer = audioBuffersRef.current[primaryElement]
      if (!primaryBuffer) {
        console.log(`[v0] No element buffer for ${primaryElement}`)
        return
      }

      if (elementBackgroundTimeoutRef.current) {
        clearTimeout(elementBackgroundTimeoutRef.current)
        elementBackgroundTimeoutRef.current = null
      }

      if (elementBackgroundSourceRef.current) {
        try {
          elementBackgroundSourceRef.current.stop()
        } catch (e) {
          // Already stopped
        }
      }
      if (elementBackgroundNextSourceRef.current) {
        try {
          elementBackgroundNextSourceRef.current.stop()
        } catch (e) {
          // Already stopped
        }
      }

      const elementGain = elementSoundVolumeRef.current / 100
      const pedalModalEnabled = pedalOptions?.modalEnabled ?? modalEnabledRef.current
      const pedalSunSignIndex =
        typeof pedalOptions?.sunSignIndex === "number" ? pedalOptions.sunSignIndex : modalSunSignIndexRef.current
      const rulerPlanetName = getSignRulerPlanetName(pedalSunSignIndex)
      const pedalBasePlaybackRate = getPlanetPrincipalPlaybackRate(rulerPlanetName, pedalModalEnabled, pedalSunSignIndex)
      const pedalTunedPlaybackRate = pedalBasePlaybackRate * centsToPlaybackRate(tuningCentsRef.current)

      const primaryGain = ctx.createGain()
      primaryGain.gain.value = elementGain

      const primarySource = ctx.createBufferSource()
      primarySource.buffer = primaryBuffer
      primarySource.loop = true
      primarySource.playbackRate.value = pedalTunedPlaybackRate

      primarySource.connect(primaryGain)
      const masterNode = masterGainNodeRef.current || ctx.destination
      primaryGain.connect(masterNode)
      primarySource.start(0)

      elementBackgroundSourceRef.current = primarySource
      elementBackgroundGainRef.current = primaryGain
      elementBackgroundNextSourceRef.current = null
      elementBackgroundNextGainRef.current = null

      if (secondaryElement) {
        const secondaryBuffer = audioBuffersRef.current[secondaryElement]
        if (!secondaryBuffer) {
          console.log(`[v0] No element buffer for ${secondaryElement}`)
          return
        }

        const startTime = ctx.currentTime + Math.max(0, crossfadeDelaySeconds)

        const secondaryGain = ctx.createGain()
        secondaryGain.gain.setValueAtTime(0, startTime)
        secondaryGain.gain.linearRampToValueAtTime(elementGain, startTime + crossfadeDurationSeconds)

        const secondarySource = ctx.createBufferSource()
        secondarySource.buffer = secondaryBuffer
        secondarySource.loop = true
        secondarySource.playbackRate.value = pedalTunedPlaybackRate
        secondarySource.connect(secondaryGain)
        const masterNode = masterGainNodeRef.current || ctx.destination
        secondaryGain.connect(masterNode)
        secondarySource.start(startTime)

        primaryGain.gain.setValueAtTime(primaryGain.gain.value, startTime)
        primaryGain.gain.linearRampToValueAtTime(0, startTime + crossfadeDurationSeconds)

        elementBackgroundNextSourceRef.current = secondarySource
        elementBackgroundNextGainRef.current = secondaryGain

        elementBackgroundTimeoutRef.current = setTimeout(() => {
          try {
            primarySource.stop()
          } catch (e) {
            // Already stopped
          }
          elementBackgroundSourceRef.current = secondarySource
          elementBackgroundGainRef.current = secondaryGain
          elementBackgroundNextSourceRef.current = null
          elementBackgroundNextGainRef.current = null
        }, (crossfadeDelaySeconds + crossfadeDurationSeconds) * 1000)
      }
    },
    [initializeAudio],
  )

  const stopElementBackground = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return

    const FADE_OUT_TIME = 5
    const currentTime = ctx.currentTime

    if (elementBackgroundGainRef.current) {
      elementBackgroundGainRef.current.gain.setValueAtTime(elementBackgroundGainRef.current.gain.value, currentTime)
      elementBackgroundGainRef.current.gain.linearRampToValueAtTime(0, currentTime + FADE_OUT_TIME)
    }
    if (elementBackgroundNextGainRef.current) {
      elementBackgroundNextGainRef.current.gain.setValueAtTime(
        elementBackgroundNextGainRef.current.gain.value,
        currentTime,
      )
      elementBackgroundNextGainRef.current.gain.linearRampToValueAtTime(0, currentTime + FADE_OUT_TIME)
    }

    setTimeout(() => {
      if (elementBackgroundSourceRef.current) {
        try {
          elementBackgroundSourceRef.current.stop()
        } catch (e) {
          // Already stopped
        }
        elementBackgroundSourceRef.current = null
      }
      if (elementBackgroundNextSourceRef.current) {
        try {
          elementBackgroundNextSourceRef.current.stop()
        } catch (e) {
          // Already stopped
        }
        elementBackgroundNextSourceRef.current = null
      }
      elementBackgroundGainRef.current = null
      elementBackgroundNextGainRef.current = null
    }, FADE_OUT_TIME * 1000)
  }, [])

  const initializeFmPadSynth = useCallback(async () => {
    if (fmPadSynthRef.current && toneModuleRef.current) {
      return
    }

    const Tone = await import("tone")
    toneModuleRef.current = Tone

    await Tone.start()

    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1.8,
      modulationIndex: 6,
      oscillator: { type: "sine" },
      envelope: {
        attack: 0.9,
        decay: 0.8,
        sustain: 0.65,
        release: 3.2,
      },
      modulation: { type: "triangle" },
      modulationEnvelope: {
        attack: 1.2,
        decay: 1.0,
        sustain: 0.55,
        release: 2.6,
      },
    })
    synth.volume.value = -8

    const filter = new Tone.Filter({ type: "lowpass", frequency: 2200, rolloff: -24 })
    const chorus = new Tone.Chorus({ frequency: 0.8, delayTime: 2.2, depth: 0.25, wet: 0.22 }).start()
    const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.03, wet: 0.24 })
    await reverb.generate()

    const gain = new Tone.Gain(Math.max(0, (masterVolumeRef.current / 100) * 0.22))

    synth.connect(filter)
    filter.connect(chorus)
    chorus.connect(reverb)
    reverb.connect(gain)
    gain.toDestination()

    fmPadSynthRef.current = synth
    fmPadGainRef.current = gain
  }, [])

  const triggerFmPadNotes = useCallback(
    async (
      principalSemitoneOffset: number,
      aspects: any[] = [],
      aspectVolumeOverride?: number,
    ) => {
      await initializeFmPadSynth()
      if (!toneModuleRef.current || !fmPadSynthRef.current) return

      const Tone = toneModuleRef.current
      const synth = fmPadSynthRef.current
      const tunedRate = centsToPlaybackRate(tuningCentsRef.current)
      const pitchShiftFromTuning = 12 * Math.log2(tunedRate)
      const baseMidi = 60 + principalSemitoneOffset + DEFAULT_SYSTEM_OCTAVE_SHIFT_SEMITONES + pitchShiftFromTuning

      const principalDuration = Math.max(
        0.8,
        (Number.isFinite(envelope.fadeIn) ? envelope.fadeIn : 7) + (Number.isFinite(envelope.fadeOut) ? envelope.fadeOut : 7),
      )
      const principalNote = Tone.Frequency(baseMidi, "midi").toNote()
      synth.triggerAttackRelease(principalNote, principalDuration)

      if (!aspects || aspects.length === 0) return

      const aspectVolume =
        typeof aspectVolumeOverride === "number" ? aspectVolumeOverride : aspectsSoundVolumeRef.current
      const aspectGainFactor = Math.max(0.1, Math.min(1, aspectVolume / 100))
      const aspectDuration = Math.max(0.6, dynAspectsFadeInRef.current + dynAspectsSustainRef.current + dynAspectsFadeOutRef.current)

      aspects.forEach((aspect, index) => {
        const semitoneOffset = ASPECT_SEMITONE_OFFSETS[aspect.aspectType] ?? null
        if (semitoneOffset === null) return
        const aspectMidi = baseMidi + semitoneOffset
        const aspectNote = Tone.Frequency(aspectMidi, "midi").toNote()
        const velocity = Math.max(0.08, Math.min(0.7, 0.45 * aspectGainFactor))
        synth.triggerAttackRelease(aspectNote, aspectDuration, `+${index * 0.03}`, velocity)
      })
    },
    [envelope.fadeIn, envelope.fadeOut, initializeFmPadSynth],
  )

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
      const normalizedPlanetName = planetName.toLowerCase()
      const audioMode = audioEngineModeRef.current || "samples"

      if (playingPlanetsRef.current.has(planetName)) {
        console.log(`[v0] Planet ${planetName} is already playing`)
        return
      }

      const principalSemitoneOffset = getPlanetPrincipalSemitoneOffset(
        normalizedPlanetName,
        modalEnabledRef.current,
        modalSunSignIndexRef.current,
      )
      const basePlaybackRate = getPlanetPrincipalPlaybackRate(
        normalizedPlanetName,
        modalEnabledRef.current,
        modalSunSignIndexRef.current,
      )
      const fmTotalDuration =
        (Number.isFinite(envelope.fadeIn) ? envelope.fadeIn : 7) + (Number.isFinite(envelope.fadeOut) ? envelope.fadeOut : 7)

      if (audioMode === "hybrid" || audioMode === "fm_pad") {
        await triggerFmPadNotes(principalSemitoneOffset, aspects, aspectVolumeOverride)
      }

      if (audioMode === "fm_pad") {
        playingPlanetsRef.current.add(planetName)
        setTimeout(() => {
          playingPlanetsRef.current.delete(planetName)
        }, Math.max(200, fmTotalDuration * 1000))
        return
      }

      if (activeTracksRef.current.size >= 15) {
        console.log(`[v0] Max polyphony reached (15 sounds)`)
        return
      }

      const audioBuffer = audioBuffersRef.current[normalizedPlanetName]
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

        source.playbackRate.value = basePlaybackRate

        if (!resonanceSceneRef.current || !resonanceSceneRef.current.output) {
          console.error("[v0] Resonance Audio scene not properly initialized")
          return
        }

        const panner = resonanceSceneRef.current.createSource()

        const gainNode = ctx.createGain()
        const dryGainNode = ctx.createGain()
        const wetSendGainNode = ctx.createGain()
        const reverbReturnGainNode = ctx.createGain()
        const reverbShelfNode = ctx.createBiquadFilter()
        const convolverNode = ctx.createConvolver()

        if (!planetReverbImpulseRef.current) {
          planetReverbImpulseRef.current = createLowDiffusionReverbImpulse(ctx, 3)
        }
        convolverNode.buffer = planetReverbImpulseRef.current
        reverbShelfNode.type = "highshelf"
        reverbShelfNode.frequency.value = 800
        reverbShelfNode.gain.value = -6
        dryGainNode.gain.value = 0.8
        wetSendGainNode.gain.value = 0.2
        reverbReturnGainNode.gain.value = 1

        source.connect(gainNode)
        gainNode.connect(dryGainNode)
        gainNode.connect(wetSendGainNode)
        dryGainNode.connect(panner.input)
        wetSendGainNode.connect(convolverNode)
        convolverNode.connect(reverbShelfNode)
        reverbShelfNode.connect(reverbReturnGainNode)
        reverbReturnGainNode.connect(panner.input)

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
        const planetVolumeMultiplier = getPlanetVolumeMultiplier(planetName)

        gainNode.gain.setValueAtTime(0, currentTime)
        gainNode.gain.linearRampToValueAtTime(planetVolumeMultiplier, currentTime + fadeInTime)

        gainNode.gain.setValueAtTime(planetVolumeMultiplier, currentTime + fadeInTime)
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
          // Play aspects with inherited zodiacal playbackRate plus aspect transposition
          for (const aspect of aspects) {
            const otherPlanetName = aspect.point1.name === planetName ? aspect.point2.name : aspect.point1.name

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

            const aspectSemitoneOffset = ASPECT_SEMITONE_OFFSETS[aspect.aspectType] ?? 0
            const aspectTransposeRate = Math.pow(2, aspectSemitoneOffset / 12)
            const aspectPlaybackRate = basePlaybackRate * aspectTransposeRate

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
            const aspectPlanetVolumeMultiplier = getPlanetVolumeMultiplier(otherPlanetName)
            const baseVolume = 0.33 * (aspectVolume / 100) * aspectPlanetVolumeMultiplier

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
    [envelope.fadeIn, envelope.fadeOut, initializeAudio, triggerFmPadNotes],
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
    if (fmPadSynthRef.current && typeof fmPadSynthRef.current.releaseAll === "function") {
      fmPadSynthRef.current.releaseAll()
    }
  }, [])

  useEffect(() => {
    initializeAudio()
  }, [initializeAudio])

  useEffect(() => {
    return () => {
      stopAll()
      stopBackgroundSound()
      stopElementBackground()
      if (fmPadSynthRef.current) {
        try {
          fmPadSynthRef.current.dispose()
        } catch (e) {
          // ignore
        }
        fmPadSynthRef.current = null
      }
      if (fmPadGainRef.current) {
        try {
          fmPadGainRef.current.dispose()
        } catch (e) {
          // ignore
        }
        fmPadGainRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [stopAll, stopBackgroundSound, stopElementBackground])

  return {
    playPlanetSound,
    stopAll,
    playBackgroundSound,
    stopBackgroundSound,
    playElementBackground,
    stopElementBackground,
    loadingProgress,
    loadingLabel,
    audioLevelLeftPre,
    audioLevelRightPre,
    audioLevelLeftPost,
    audioLevelRightPost,
    compressionReductionDb,
  }
}
