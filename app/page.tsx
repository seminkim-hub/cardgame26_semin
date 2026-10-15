"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock3, Moon, Pause, Play, RefreshCw, RotateCcw, Sun, Trophy } from "lucide-react";

const FRUITS = [
  { emoji: "🍓", name: "딸기", color: "pink" },
  { emoji: "🍋", name: "레몬", color: "yellow" },
  { emoji: "🍊", name: "귤", color: "orange" },
  { emoji: "🍇", name: "포도", color: "purple" },
  { emoji: "🍉", name: "수박", color: "green" },
  { emoji: "🍒", name: "체리", color: "red" },
  { emoji: "🍍", name: "파인애플", color: "gold" },
  { emoji: "🥝", name: "키위", color: "lime" },
];

type Card = { id: number; fruit: (typeof FRUITS)[number] };
type Screen = "welcome" | "playing" | "paused" | "complete";
type Theme = "light" | "dark";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type LeaderboardEntry = { rank: number; name: string; score: number; finishtime: string };

function makeCards(): Card[] {
  const deck = [...FRUITS, ...FRUITS].map((fruit, id) => ({ fruit, id }));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [name, setName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [theme, setTheme] = useState<Theme>("light");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardMessage, setLeaderboardMessage] = useState("");
  const startTime = useRef(0);
  const mismatchTimer = useRef<number | null>(null);

  useEffect(() => {
    if (screen !== "playing") return;
    const timer = window.setInterval(() => setElapsed(Date.now() - startTime.current), 250);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("fruit-match-theme");
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    window.localStorage.setItem("fruit-match-theme", theme);
  }, [theme, themeLoaded]);

  useEffect(() => () => {
    if (mismatchTimer.current) window.clearTimeout(mismatchTimer.current);
  }, []);

  const startGame = useCallback((player: string) => {
    if (mismatchTimer.current) window.clearTimeout(mismatchTimer.current);
    setPlayerName(player.trim());
    setCards(makeCards());
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setElapsed(0);
    setSaveStatus("idle");
    setSaveMessage("");
    setLeaderboard([]);
    setLeaderboardLoading(false);
    setLeaderboardMessage("");
    startTime.current = Date.now();
    setScreen("playing");
  }, []);

  const saveCompletedGame = async (score: number, finishtime: string) => {
    setSaveStatus("saving");
    setSaveMessage("");
    setLeaderboardMessage("");
    try {
      const response = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName, score, finishtime }),
      });
      const result = await response.json() as { success?: boolean; message?: string; leaderboard?: LeaderboardEntry[] };
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || "게임 기록을 저장하지 못했습니다.");
      }
      setLeaderboard(Array.isArray(result.leaderboard) ? result.leaderboard : []);
      setLeaderboardMessage("");
      setSaveStatus("saved");
      setSaveMessage(result.message || "게임 기록을 구글 시트에 저장했습니다.");
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(error instanceof Error ? error.message : "게임 기록 저장 중 오류가 발생했습니다.");
    }
  };

  const refreshLeaderboard = async () => {
    setLeaderboardLoading(true);
    setLeaderboardMessage("");
    try {
      const response = await fetch("/api/scores", { cache: "no-store" });
      const result = await response.json() as { success?: boolean; message?: string; leaderboard?: LeaderboardEntry[] };
      if (!response.ok || result.success !== true || !Array.isArray(result.leaderboard)) {
        throw new Error(result.message || "순위를 불러오지 못했습니다.");
      }
      setLeaderboard(result.leaderboard);
    } catch (error) {
      setLeaderboardMessage(error instanceof Error ? error.message : "순위를 불러오지 못했습니다.");
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const showWelcome = () => {
    if (mismatchTimer.current) window.clearTimeout(mismatchTimer.current);
    setFlipped([]);
    setMatched([]);
    setElapsed(0);
    setScreen("welcome");
  };

  const pauseGame = () => {
    setElapsed(Date.now() - startTime.current);
    setFlipped([]);
    if (mismatchTimer.current) window.clearTimeout(mismatchTimer.current);
    setScreen("paused");
  };

  const resumeGame = () => {
    startTime.current = Date.now() - elapsed;
    setScreen("playing");
  };

  const flipCard = (card: Card) => {
    if (screen !== "playing" || flipped.length >= 2 || flipped.includes(card.id) || matched.includes(card.id)) return;

    const nextFlipped = [...flipped, card.id];
    setFlipped(nextFlipped);
    if (nextFlipped.length === 2) {
      setMoves((current) => current + 1);
      const firstCard = cards.find((item) => item.id === nextFlipped[0]);
      if (firstCard?.fruit.name === card.fruit.name) {
        const nextMatched = [...matched, ...nextFlipped];
        setMatched(nextMatched);
        setFlipped([]);
        if (nextMatched.length === cards.length) {
          const finishMilliseconds = Date.now() - startTime.current;
          const finishLabel = formatTime(finishMilliseconds);
          setElapsed(finishMilliseconds);
          setScreen("complete");
          void saveCompletedGame(moves + 1, finishLabel);
        }
      } else {
        mismatchTimer.current = window.setTimeout(() => setFlipped([]), 850);
      }
    }
  };

  return (
    <main className="game-shell" data-theme={theme}>
      <header className="topbar">
        <button className="brand" onClick={showWelcome} aria-label="처음 화면으로">
          <span className="brand-mark">🍊</span>
          <span>카드를 맞춰라!</span>
        </button>
        <div className="topbar-note"><span className="live-dot" /> 오늘의 두뇌 스트레칭</div>
        <div className="topbar-actions">
          <button className="sound-toggle" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} aria-label={theme === "light" ? "다크 모드로 변경" : "라이트 모드로 변경"} title={theme === "light" ? "다크 모드" : "라이트 모드"}>
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </div>
      </header>

      {screen === "welcome" ? (
        <section className="welcome-layout">
          <div className="orange-watermark" aria-hidden="true"><span>🍊</span></div>
          <div className="welcome-copy">
            <h1>카드를 맞춰라!<br /><span>과일 짝을 찾아요</span></h1>
            <p className="intro">뒤집힌 카드 속 과일을 기억하고<br className="desktop-break" /> 똑같은 과일 두 장을 찾아보세요.</p>
            <div className="welcome-facts">
              <div className="fact-icon">🧠</div>
              <div><strong>천천히 기억해도 괜찮아요</strong><span>4×4 카드, 과일 8쌍</span></div>
            </div>
          </div>
          <div className="welcome-card">
            <div className="fruit-scatter" aria-hidden="true"><span>🍓</span><span>🍋</span><span>🍇</span><span>🍊</span><span>🍒</span></div>
            <div className="welcome-card-inner">
              <div className="card-label">준비되셨나요?</div>
              <h2>이름을 알려주세요</h2>
              <p>기록에 이름을 남겨드릴게요.</p>
              <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) startGame(name); }}>
                <label htmlFor="player-name">플레이어 이름</label>
                <input id="player-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 과일 탐험가" maxLength={16} autoComplete="name" />
                <button className="primary-button start-button" type="submit" disabled={!name.trim()}><span>게임 시작</span><span className="button-arrow">→</span></button>
              </form>
              <div className="rules-note"><span>✦</span> 짝을 맞출 때마다 카드가 반짝여요</div>
            </div>
          </div>
        </section>
      ) : (
        <section className="play-layout">
          <div className="play-heading">
            <div>
              <div className="eyebrow"><span className="live-dot" /> 과일 짝 맞추기</div>
              <h1>{screen === "complete" ? "정말 잘했어요!" : screen === "paused" ? "잠깐 쉬어가요" : <>반가워요, <span>{playerName}</span>님!</>}</h1>
              <p>{screen === "complete" ? "과일 친구들을 모두 찾았어요." : screen === "paused" ? "준비되면 이어서 플레이하세요." : "같은 과일 두 장을 찾아 짝을 맞춰보세요."}</p>
            </div>
            <div className="heading-fruit" aria-hidden="true">🍍</div>
          </div>

          <div className="game-panel">
            <div className="game-toolbar">
              <div className="stats">
                <div className="stat-item"><span className="stat-icon timer-icon"><Clock3 size={17} /></span><span className="stat-label">경과 시간</span><strong>{formatTime(elapsed)}</strong></div>
                <div className="stat-divider" />
                <div className="stat-item"><span className="stat-icon move-icon">↗</span><span className="stat-label">시도 횟수</span><strong>{moves}<small>회</small></strong></div>
                <div className="stat-divider" />
                <div className="stat-item"><span className="stat-icon pair-icon">♡</span><span className="stat-label">찾은 짝</span><strong>{matched.length / 2}<small> / {FRUITS.length}</small></strong></div>
              </div>
              <div className="game-actions">
                {screen === "playing" ? <button className="quiet-button" onClick={pauseGame}><Pause size={15} /> 잠시 멈춤</button> : screen === "paused" ? <button className="quiet-button resume-button" onClick={resumeGame}><Play size={15} /> 이어하기</button> : null}
                {screen !== "complete" && <button className="restart-button" onClick={() => startGame(playerName)} aria-label="게임 다시 시작"><RotateCcw size={17} /></button>}
              </div>
            </div>

            <div className={`card-grid ${screen !== "playing" ? "is-covered" : ""}`} aria-label="과일 카드 16장">
              {cards.map((card, index) => {
                const isFaceUp = flipped.includes(card.id) || matched.includes(card.id);
                const isMatched = matched.includes(card.id);
                return (
                  <button key={card.id} className={`fruit-card ${isFaceUp ? "is-face-up" : ""} ${isMatched ? "is-matched" : ""}`} onClick={() => flipCard(card)} aria-label={isFaceUp ? `${card.fruit.name} 카드` : `${index + 1}번째 뒤집힌 카드`} aria-pressed={isFaceUp} disabled={screen !== "playing" || isMatched}>
                    <span className="card-back"><span className="card-back-mark">✳</span></span>
                    <span className={`card-front fruit-${card.fruit.color}`}><span className="fruit-emoji">{card.fruit.emoji}</span><span className="fruit-name">{card.fruit.name}</span></span>
                  </button>
                );
              })}
              {screen === "paused" && <div className="board-overlay"><div className="overlay-symbol">☕</div><strong>잠시 쉬어가요</strong><span>카드와 시간이 멈췄어요</span><button className="primary-button overlay-button" onClick={resumeGame}><Play size={15} fill="currentColor" /> 이어서 하기</button></div>}
              {screen === "complete" && <div className="board-overlay complete-overlay"><div className="overlay-symbol"><Trophy size={34} /></div><strong>모든 짝을 찾았어요!</strong><span>{playerName}님의 기록 · {formatTime(elapsed)} · {moves}번 시도</span><span className={`save-status ${saveStatus}`} aria-live="polite">{saveStatus === "saving" ? "구글 시트에 기록을 저장하고 있어요." : saveMessage}</span><button className="primary-button overlay-button" onClick={showWelcome}><ArrowLeft size={15} /> 처음으로</button></div>}
            </div>
            <div className="game-footer"><span><span className="footer-sparkle">✦</span> 과일의 위치를 기억해보세요</span><span>뒤집은 카드 <b>{flipped.length}</b> / 2</span></div>
          </div>
          {screen === "complete" && (
            <section className="game-panel leaderboard-panel" aria-labelledby="leaderboard-title">
              <div className="leaderboard-heading">
                <div><span className="leaderboard-kicker">빠른 기록 순위</span><h2 id="leaderboard-title">완료 시간 상위 3명</h2></div>
                <div className="leaderboard-heading-actions">
                  <span className="leaderboard-sort">종료 시간 빠른 순</span>
                  <button className="leaderboard-refresh" type="button" onClick={() => void refreshLeaderboard()} disabled={leaderboardLoading || saveStatus === "saving"}>
                    <RefreshCw size={13} className={leaderboardLoading ? "is-spinning" : ""} /> 순위 새로고침
                  </button>
                </div>
              </div>
              {saveStatus === "saving" ? (
                <p className="leaderboard-empty" aria-live="polite">기록 저장 후 순위를 불러오고 있어요.</p>
              ) : leaderboardLoading ? (
                <p className="leaderboard-empty" aria-live="polite">시트에서 순위를 불러오고 있어요.</p>
              ) : leaderboard.length > 0 ? (
                <ol className="leaderboard-list">
                  {leaderboard.map((entry, index) => (
                    <li className={`leaderboard-row rank-${entry.rank}`} key={`${entry.rank}-${entry.name}-${entry.finishtime}-${index}`}>
                      <span className="leaderboard-rank">{entry.rank}</span>
                      <strong className="leaderboard-name">{entry.name}</strong>
                      <span className="leaderboard-moves">{entry.score}회 시도</span>
                      <time className="leaderboard-time">{entry.finishtime}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="leaderboard-empty">{leaderboardMessage || (saveStatus === "error" ? saveMessage || "순위를 불러오지 못했습니다. Apps Script 배포 설정을 확인해주세요." : "순위 기록이 없습니다. 새로고침을 눌러 시트 기록을 확인해보세요.")}</p>
              )}
            </section>
          )}
          {screen === "complete" && <button className="back-home" onClick={showWelcome}><ArrowLeft size={16} /> 처음 화면으로</button>}
        </section>
      )}
      <footer className="site-footer">Copyright INU 카드 맞추기 게임 by Semin Kim</footer>
    </main>
  );
}
