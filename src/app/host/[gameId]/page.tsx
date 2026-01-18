"use client"

import { useEffect, useState, useCallback, use } from "react"
import { supabase, type Game, type Player, type GameEvent } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { QRCodeSVG } from "qrcode.react"
import { motion, AnimatePresence } from "framer-motion"
import { useGameAudio } from "@/hooks/useGameAudio"

const FTX_MESSAGES = [
  "Yield is up! Your funds are SAFU!",
  "FTX is the most liquid exchange on earth.",
  "We have the best risk management in the industry.",
  "Customer funds are always 1:1 backed.",
  "FTX reserves are fully audited.",
  "Trust the process. Your assets are secure.",
]

const JOURNALIST_EVENTS = [
  { time: 120, message: "BREAKING: Report suggests FTX and Alameda Research are mixing customer funds" },
  { time: 180, message: "ALERT: FTT Token value crashing — down 40% in the last hour" },
  { time: 240, message: "LEAKED: Internal memo reveals 'the vault may be empty'" },
]

const PAUSE_EXPLANATIONS = [
  { minute: 1, title: "The Setup", text: "In 2019, Sam Bankman-Fried created FTX, marketed as a safe, regulated exchange. Customers deposited billions, trusting their money was secure." },
  { minute: 2, title: "The Secret", text: "Behind the scenes, FTX secretly funneled customer deposits to Alameda Research — their own trading firm — to make risky bets." },
  { minute: 3, title: "The Cracks", text: "When reporters started asking questions, FTX reassured everyone. But the truth was: customer money had been gambled away." },
  { minute: 4, title: "The Run", text: "Once trust broke, everyone tried to withdraw at once. But the money wasn't there. This is called a 'bank run.'" },
]

export default function HostPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [pauseInfo, setPauseInfo] = useState<{ title: string; text: string } | null>(null)
  const [lastFtxMessage, setLastFtxMessage] = useState("")
  const [showJournalist, setShowJournalist] = useState(false)
  const [journalistMessage, setJournalistMessage] = useState("")
  const [screenShake, setScreenShake] = useState(false)
  const [totalVault, setTotalVault] = useState(0)
  const [withdrawnPlayers, setWithdrawnPlayers] = useState(0)

  // Play background music when game starts
  useGameAudio(game?.status === "playing", "/game-music.mp3")

  const fetchGame = useCallback(async () => {
    const { data } = await supabase.from("games").select().eq("id", gameId).single()
    if (data) setGame(data)
  }, [gameId])

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from("players")
      .select()
      .eq("game_id", gameId)
      .order("created_at", { ascending: true })
    if (data) {
      setPlayers(data)
      setWithdrawnPlayers(data.filter(p => p.has_withdrawn).length)
    }
  }, [gameId])

  useEffect(() => {
    fetchGame()
    fetchPlayers()

    const gameChannel = supabase
      .channel("game-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, () => fetchGame())
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` }, () => fetchPlayers())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_events", filter: `game_id=eq.${gameId}` }, (payload) => {
        const event = payload.new as GameEvent
        setEvents(prev => [...prev, event])
      })
      .subscribe()

    return () => { supabase.removeChannel(gameChannel) }
  }, [gameId, fetchGame, fetchPlayers])

  useEffect(() => {
    if (game?.status !== "playing" || isPaused) return

    const timer = setInterval(() => {
      if (!game.started_at) return
      const start = new Date(game.started_at).getTime()
      const pausedTime = game.paused_at ? (Date.now() - new Date(game.paused_at).getTime()) : 0
      const elapsed = Math.floor((Date.now() - start - pausedTime) / 1000)
      setElapsedSeconds(elapsed)

      const activePlayerCount = players.filter(p => !p.has_withdrawn).length
      const baseVault = activePlayerCount * 100
      const growth = baseVault * (1 + 0.01 * elapsed)
      setTotalVault(growth)

      if (elapsed >= 300) {
        endGame()
      }
    }, 100)

    return () => clearInterval(timer)
  }, [game, isPaused, players])

  useEffect(() => {
    if (game?.status !== "playing" || isPaused) return

    const ftxInterval = setInterval(() => {
      if (elapsedSeconds < 240) {
        const msg = FTX_MESSAGES[Math.floor(Math.random() * FTX_MESSAGES.length)]
        setLastFtxMessage(msg)
        supabase.from("game_events").insert({ game_id: gameId, event_type: "ftx_message", message: msg })
      }
    }, 30000)

    return () => clearInterval(ftxInterval)
  }, [game, isPaused, elapsedSeconds, gameId])

  useEffect(() => {
    if (game?.status !== "playing") return

    JOURNALIST_EVENTS.forEach(event => {
      if (elapsedSeconds >= event.time && elapsedSeconds < event.time + 2) {
        setJournalistMessage(event.message)
        setShowJournalist(true)
        setScreenShake(true)
        supabase.from("game_events").insert({ game_id: gameId, event_type: "journalist", message: event.message })
        setTimeout(() => setScreenShake(false), 500)
        setTimeout(() => setShowJournalist(false), 8000)
      }
    })
  }, [elapsedSeconds, game, gameId])

  useEffect(() => {
    if (game?.status !== "playing") return

    PAUSE_EXPLANATIONS.forEach(pause => {
      const pauseTime = pause.minute * 60
      if (elapsedSeconds === pauseTime && !isPaused) {
        triggerPause(pause.title, pause.text)
      }
    })
  }, [elapsedSeconds, game, isPaused])

  const startGame = async () => {
    await supabase.from("games").update({ status: "playing", started_at: new Date().toISOString() }).eq("id", gameId)
    await supabase.from("game_events").insert({ game_id: gameId, event_type: "game_start", message: "Game has started!" })
  }

  const triggerPause = async (title: string, text: string) => {
    setIsPaused(true)
    setPauseInfo({ title, text })
    await supabase.from("games").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", gameId)
    await supabase.from("game_events").insert({ game_id: gameId, event_type: "pause", message: text })
  }

  const resumeGame = async () => {
    if (!game?.paused_at || !game?.started_at) return
    const pauseDuration = Date.now() - new Date(game.paused_at).getTime()
    const newStartedAt = new Date(new Date(game.started_at).getTime() + pauseDuration).toISOString()
    
    setIsPaused(false)
    setPauseInfo(null)
    await supabase.from("games").update({ 
      status: "playing", 
      paused_at: null,
      started_at: newStartedAt 
    }).eq("id", gameId)
    await supabase.from("game_events").insert({ game_id: gameId, event_type: "resume", message: "Game resumed" })
  }

  const endGame = async () => {
    await supabase.from("games").update({ status: "ended", total_vault_display: totalVault, actual_vault: 0 }).eq("id", gameId)
    await supabase.from("game_events").insert({ game_id: gameId, event_type: "game_end", message: "FTX has filed for bankruptcy." })
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount)
  }

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}?code=${game?.code}` : ""

  if (!game) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>
  }

  if (game.status === "ended") {
    const totalClaims = players.reduce((sum, p) => sum + Number(p.balance), 0)
    const totalWithdrawn = players.reduce((sum, p) => sum + Number(p.withdrawn_amount), 0)

    return (
      <div className="min-h-screen grid-bg flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="crypto-card rounded-2xl p-8 max-w-2xl w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-4xl font-bold neon-text-red mb-2">BANKRUPTCY FILING</h1>
          <p className="text-muted-foreground mb-8">FTX Trading Ltd. - Chapter 11</p>
          
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-background/50 rounded-xl p-6">
              <p className="text-muted-foreground text-sm mb-2">Total Customer Claims</p>
              <p className="text-3xl font-bold neon-text-green">{formatMoney(totalClaims + totalWithdrawn)}</p>
            </div>
            <div className="bg-background/50 rounded-xl p-6">
              <p className="text-muted-foreground text-sm mb-2">Actual Cash Available</p>
              <p className="text-3xl font-bold neon-text-red">{formatMoney(0)}</p>
            </div>
          </div>

          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-6">
            <p className="text-destructive font-medium">
              {withdrawnPlayers} of {players.length} players escaped with {formatMoney(totalWithdrawn)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {players.length - withdrawnPlayers} players lost everything when withdrawals froze
            </p>
          </div>

          <p className="text-muted-foreground text-sm">
            This is exactly what happened to FTX customers in November 2022.
            <br />Trust hid insolvency until it was too late.
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen grid-bg p-4 ${screenShake ? "animate-screen-shake" : ""} ${showJournalist ? "animate-red-flash" : ""}`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold neon-text-green">THE LIQUIDITY ILLUSION</h1>
            <p className="text-muted-foreground">Game Master View</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-mono font-bold neon-text-blue">{formatTime(elapsedSeconds)}</p>
            <p className="text-muted-foreground text-sm">of 5:00</p>
          </div>
        </div>

        {game.status === "waiting" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="crypto-card rounded-2xl p-6 text-center">
              <h2 className="text-xl font-semibold mb-4">Join Code</h2>
              <p className="text-5xl font-mono font-bold neon-text-green tracking-widest mb-4">{game.code}</p>
              <div className="bg-white p-4 rounded-xl inline-block mb-4">
                <QRCodeSVG value={joinUrl} size={200} />
              </div>
              <p className="text-muted-foreground text-sm">Scan to join or enter code at homepage</p>
            </div>

            <div className="crypto-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Players ({players.length})</h2>
                <span className="text-muted-foreground text-sm">Need at least 2</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {players.map((player, i) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between bg-background/50 rounded-lg px-4 py-2"
                  >
                    <span>{player.name}</span>
                    <span className="text-[#00ff88] font-mono">{formatMoney(player.balance)}</span>
                  </motion.div>
                ))}
                {players.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Waiting for players...</p>
                )}
              </div>
              <Button
                onClick={startGame}
                disabled={players.length < 2}
                className="w-full bg-[#00ff88] hover:bg-[#00dd77] text-black font-semibold h-12"
              >
                START GAME
              </Button>
            </div>
          </div>
        )}

        {(game.status === "playing" || game.status === "paused") && (
          <>
            <div className="crypto-card rounded-2xl p-6 mb-6">
              <div className="text-center">
                <p className="text-muted-foreground text-sm mb-2">FTX TOTAL VAULT BALANCE</p>
                <p className="text-6xl md:text-8xl font-bold neon-text-green animate-pulse-glow font-mono">
                  {formatMoney(totalVault)}
                </p>
                <p className="text-muted-foreground mt-2">+1% per second • {players.filter(p => !p.has_withdrawn).length} active depositors</p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div className="crypto-card rounded-xl p-4">
                <p className="text-muted-foreground text-sm mb-1">Players</p>
                <p className="text-2xl font-bold">{players.length}</p>
              </div>
              <div className="crypto-card rounded-xl p-4">
                <p className="text-muted-foreground text-sm mb-1">Withdrawn</p>
                <p className="text-2xl font-bold text-[#00d4ff]">{withdrawnPlayers}</p>
              </div>
              <div className="crypto-card rounded-xl p-4">
                <p className="text-muted-foreground text-sm mb-1">Phase</p>
                <p className="text-2xl font-bold">{elapsedSeconds < 240 ? "Normal" : <span className="neon-text-red">CRISIS</span>}</p>
              </div>
            </div>

            {lastFtxMessage && (
              <motion.div
                key={lastFtxMessage}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="crypto-card rounded-xl p-4 mb-6 border-[#00ff88]/30"
              >
                <p className="text-sm text-muted-foreground mb-1">FTX Official</p>
                <p className="text-lg neon-text-green">{lastFtxMessage}</p>
              </motion.div>
            )}

            <AnimatePresence>
              {showJournalist && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="crypto-card rounded-xl p-6 mb-6 border-destructive/50 bg-destructive/10"
                >
                  <p className="text-sm text-destructive mb-1 font-semibold">⚡ BREAKING NEWS</p>
                  <p className="text-xl neon-text-red">{journalistMessage}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isPaused && pauseInfo && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
                >
                  <div className="crypto-card rounded-2xl p-8 max-w-xl w-full text-center">
                    <p className="text-sm text-[#00d4ff] font-semibold mb-2">PAUSE — STORY TIME</p>
                    <h2 className="text-3xl font-bold mb-4">{pauseInfo.title}</h2>
                    <p className="text-lg text-muted-foreground mb-6">{pauseInfo.text}</p>
                    <Button onClick={resumeGame} className="bg-[#00ff88] hover:bg-[#00dd77] text-black font-semibold h-12 px-8">
                      RESUME GAME
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="crypto-card rounded-xl p-4">
              <h3 className="font-semibold mb-3">Player Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {players.map(player => (
                  <div
                    key={player.id}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      player.has_withdrawn
                        ? "bg-[#00d4ff]/20 border border-[#00d4ff]/30"
                        : "bg-background/50"
                    }`}
                  >
                    <p className="truncate font-medium">{player.name}</p>
                    <p className={`font-mono text-xs ${player.has_withdrawn ? "text-[#00d4ff]" : "text-[#00ff88]"}`}>
                      {player.has_withdrawn ? "ESCAPED" : formatMoney(player.balance)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
