import { useEffect, useRef } from 'react'

export const useGameAudio = (shouldPlay: boolean, audioUrl: string) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.loop = true
      audioRef.current.volume = 0.3
    }

    if (shouldPlay) {
      audioRef.current.play().catch(() => {
        // Audio autoplay prevented by browser
      })
    } else {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    return () => {
      if (audioRef.current && shouldPlay) {
        audioRef.current.pause()
      }
    }
  }, [shouldPlay, audioUrl])

  return audioRef
}
