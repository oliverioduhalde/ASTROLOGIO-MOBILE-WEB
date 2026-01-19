export interface GlyphAnimation {
  planetName: string
  startTime: number
  expandDuration: number
  contractDuration: number
}

export class GlyphAnimationManager {
  private animations: Map<string, GlyphAnimation> = new Map()
  private animationFrameIds: Map<string, number> = new Map()

  startAnimation(planetName: string): (progress: number) => void {
    const animation: GlyphAnimation = {
      planetName,
      startTime: Date.now(),
      expandDuration: 5000, // 5 seconds to expand from 100% to 200%
      contractDuration: 10000, // 10 seconds to contract from 200% to 100%
    }

    const existingId = this.animationFrameIds.get(planetName)
    if (existingId) cancelAnimationFrame(existingId)

    this.animations.set(planetName, animation)

    let callback: (progress: number) => void = () => {}

    const animate = () => {
      const elapsed = Date.now() - animation.startTime
      const delayedElapsed = Math.max(0, elapsed - 100)
      const totalDuration = animation.expandDuration + animation.contractDuration

      let scale = 1

      if (elapsed < 100) {
        // Initial delay phase: no animation yet
        scale = 1
      } else if (delayedElapsed < animation.expandDuration) {
        const expandProgress = delayedElapsed / animation.expandDuration
        scale = 1 + expandProgress // 1 to 2
      } else if (delayedElapsed < totalDuration) {
        const contractElapsed = delayedElapsed - animation.expandDuration
        const contractProgress = contractElapsed / animation.contractDuration
        scale = 2 - contractProgress // 2 to 1
      } else {
        // Animation complete
        scale = 1
        this.animations.delete(planetName)
        this.animationFrameIds.delete(planetName)
        return
      }

      callback(scale)
      const id = requestAnimationFrame(animate)
      this.animationFrameIds.set(planetName, id)
    }

    animate()

    return (cb: (scale: number) => void) => {
      callback = cb
    }
  }

  getScale(planetName: string): number {
    const animation = this.animations.get(planetName)
    if (!animation) return 1

    const elapsed = Date.now() - animation.startTime
    const delayedElapsed = Math.max(0, elapsed - 100)
    const totalDuration = animation.expandDuration + animation.contractDuration

    if (elapsed < 100) {
      return 1
    } else if (delayedElapsed < animation.expandDuration) {
      const expandProgress = delayedElapsed / animation.expandDuration
      return 1 + expandProgress
    } else if (delayedElapsed < totalDuration) {
      const contractElapsed = delayedElapsed - animation.expandDuration
      const contractProgress = contractElapsed / animation.contractDuration
      return 2 - contractProgress
    }

    return 1
  }
}
