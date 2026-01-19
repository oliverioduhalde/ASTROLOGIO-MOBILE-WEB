import CircularNatalHoroscope from "circular-natal-horoscope-js"

// @ts-ignore - Library types may not be fully compatible
const { Origin, Horoscope } = CircularNatalHoroscope

export interface HoroscopeData {
  planets: Array<{
    name: string
    label: string
    ChartPosition: {
      Horizon: {
        DecimalDegrees: number
        ArcDegreesFormatted: string
      }
      Ecliptic: {
        DecimalDegrees: number
        ArcDegreesFormatted: string
        ArcDegreesFormatted30: string
      }
    }
    declination: number
    Sign: {
      label: string
    }
    House: number
    isRetrograde: boolean
  }>
  mc: {
    label: string
    ChartPosition: {
      Ecliptic: {
        DecimalDegrees: number
        ArcDegreesFormatted30: string
      }
    }
    Sign: {
      label: string
    }
  }
  ascendant: {
    label: string
    sign: {
      label: string
    }
    ChartPosition: {
      Ecliptic: {
        DecimalDegrees: number
        ArcDegreesFormatted30: string
      }
    }
  }
  aspects: Array<{
    point1: { name: string; label: string }
    point2: { name: string; label: string }
    aspectType: string
    angle: number
    orb: number
  }>
}

export async function calculateHoroscope(formData: {
  datetime: string
  latitude: number
  longitude: number
  isSidereal?: boolean
}): Promise<HoroscopeData> {
  // Parse datetime
  const date = new Date(formData.datetime)

  // Create origin
  const origin = new Origin({
    year: date.getFullYear(),
    month: date.getMonth(), // 0-indexed
    date: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    latitude: formData.latitude,
    longitude: formData.longitude,
  })

  // Create horoscope
  const horoscope = new Horoscope({
    origin: origin,
    houseSystem: "placidus",
    zodiac: formData.isSidereal ? "sidereal" : "tropical",
    aspectPoints: ["bodies", "points", "angles"],
    aspectWithPoints: ["bodies", "points", "angles"],
    aspectTypes: ["major", "minor"],
    customOrbs: {},
    language: "es",
  })

  const celestialBodies = horoscope.CelestialBodies
  const planetKeys = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]

  const planets = planetKeys
    .map((key) => {
      const planet = celestialBodies.all?.find((p: any) => p.key === key)

      if (!planet) return null

      const declination = planet.ChartPosition?.Declination?.DecimalDegrees || 0

      return {
        name: planet.key || key,
        label: planet.label || key,
        ChartPosition: {
          Horizon: {
            DecimalDegrees: planet.ChartPosition?.Horizon?.DecimalDegrees || 0,
            ArcDegreesFormatted: planet.ChartPosition?.Horizon?.ArcDegreesFormatted || "0°00'00\"",
          },
          Ecliptic: {
            DecimalDegrees: planet.ChartPosition?.Ecliptic?.DecimalDegrees || 0,
            ArcDegreesFormatted: planet.ChartPosition?.Ecliptic?.ArcDegreesFormatted || "0°00'00\"",
            ArcDegreesFormatted30: planet.ChartPosition?.Ecliptic?.ArcDegreesFormatted30 || "0°00'00\"",
          },
        },
        declination,
        Sign: {
          label: planet.Sign?.label || "Unknown",
        },
        House: planet.House?.id || 0,
        isRetrograde: planet.isRetrograde || false,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  const aspects = (horoscope.Aspects?.all || [])
    .filter((aspect: any) => {
      const allowedAspectKeys = ["conjunction", "opposition", "trine", "square", "sextile"]
      return allowedAspectKeys.includes(aspect.aspectKey)
    })
    .filter((aspect: any) => {
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
      return mainPlanets.includes(aspect.point1Key) && mainPlanets.includes(aspect.point2Key)
    })
    .map((aspect: any) => {
      if (!aspect?.point1Label || !aspect?.point2Label) return null
      return {
        point1: {
          name: aspect.point1Key,
          label: aspect.point1Label,
        },
        point2: {
          name: aspect.point2Key,
          label: aspect.point2Label,
        },
        aspectType: aspect.label || aspect.aspectKey || "Unknown",
        angle: Number.parseFloat(aspect.orb) || 0,
        orb: Number.parseFloat(aspect.orbUsed) || Number.parseFloat(aspect.orb) || 0,
      }
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)

  console.log("[v0] Horoscope object keys:", Object.keys(horoscope))
  console.log("[v0] Aspects?.all:", horoscope.Aspects?.all)
  console.log("[v0] Processed aspects:", aspects)

  const mc = {
    label: horoscope.Midheaven?.label || "MC",
    ChartPosition: {
      Ecliptic: {
        DecimalDegrees: horoscope.Midheaven?.ChartPosition?.Ecliptic?.DecimalDegrees || 0,
        ArcDegreesFormatted30: horoscope.Midheaven?.ChartPosition?.Ecliptic?.ArcDegreesFormatted30 || "0°00'00\"",
      },
    },
    Sign: {
      label: horoscope.Midheaven?.Sign?.label || "Unknown",
    },
  }

  const ascendant = {
    label: horoscope.Ascendant?.label || "ASC",
    sign: {
      label: horoscope.Ascendant?.Sign?.label || "Unknown",
    },
    ChartPosition: {
      Ecliptic: {
        DecimalDegrees: horoscope.Ascendant?.ChartPosition?.Ecliptic?.DecimalDegrees || 0,
        ArcDegreesFormatted30: horoscope.Ascendant?.ChartPosition?.Ecliptic?.ArcDegreesFormatted30 || "0°00'00\"",
      },
    },
  }

  return {
    planets,
    mc,
    ascendant,
    aspects,
  }
}

export async function calculateCustomHoroscope(
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number,
  isSidereal = false,
  preset?: string,
): Promise<HoroscopeData> {
  const datetime = `${birthDate}T${birthTime}`

  return calculateHoroscope({
    datetime,
    latitude,
    longitude,
    isSidereal,
  })
}
