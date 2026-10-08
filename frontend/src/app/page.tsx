"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, Dumbbell, FastForward, Flame, Headphones, Heart, Home, LockKeyhole, Menu, MoreHorizontal, Pencil, Play, Settings, Shield, ShoppingBag, Sparkles, Star, Trophy, Volume2, X, Zap } from "lucide-react";
import { api, firstVisitWelcome, patch, post, type AnswerResult, type Bootstrap, type Exercise, type LessonStart, type Skill, type Unit } from "@/lib/api";
import { playEffect, pronunciationSource } from "@/lib/lesson-audio";
import { WordBank } from "@/components/word-bank";
import { LessonReviewModal } from "@/components/lesson-review";
import { MascotAnimation } from "@/components/mascot-animation";

type Page = "learn" | "practice" | "leaderboards" | "quests" | "shop" | "profile";
type Popover = "language" | "streak" | "gems" | "hearts" | "more" | null;
type Lesson = LessonStart & { title: string };
const DAILY_QUEST_XP = 50;

const nav: { id: Page; title: string; emoji: string }[] = [
  { id: "learn", title: "LEARN", emoji: "🏠" },
  { id: "practice", title: "PRACTICE", emoji: "🩵" },
  { id: "leaderboards", title: "LEADERBOARDS", emoji: "🛡️" },
  { id: "quests", title: "QUESTS", emoji: "🧰" },
  { id: "shop", title: "SHOP", emoji: "🏪" },
  { id: "profile", title: "PROFILE", emoji: "👤" },
];

function Button({ children, onClick, variant = "green", disabled = false, className = "" }: { children: React.ReactNode; onClick?: () => void; variant?: "green" | "blue" | "outline" | "white" | "purple"; disabled?: boolean; className?: string }) {
  return <button className={`duo-button ${variant} ${className}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

function NavIcon({ page }: { page: Page | "more" }) {
  if (page === "learn") return <Home className="nav-icon nav-home" fill="currentColor" strokeWidth={4} />;
  if (page === "practice") return <Dumbbell className="nav-icon nav-practice" strokeWidth={5} />;
  if (page === "leaderboards") return <Shield className="nav-icon nav-league" fill="currentColor" strokeWidth={2} />;
  if (page === "quests") return <span className="nav-icon nav-quest" aria-hidden="true">▣</span>;
  if (page === "shop") return <span className="nav-icon nav-shop" aria-hidden="true">🏪</span>;
  if (page === "profile") return <span className="nav-icon nav-avatar" aria-hidden="true">Y</span>;
  return <span className="nav-icon nav-more" aria-hidden="true"><MoreHorizontal size={25} /></span>;
}

function ProgressBar({ value, max = DAILY_QUEST_XP, color = "yellow" }: { value: number; max?: number; color?: string }) {
  return <div className={`progress-track ${color}`}><div className="progress-fill" style={{ width: `${Math.min(100, 100 * value / max)}%` }} /></div>;
}

function Owl({ size = "normal", mood = "happy", dimmed = false }: { size?: "normal" | "small" | "large"; mood?: "happy" | "wink"; dimmed?: boolean }) {
  return <div className={`owl owl-${size} ${dimmed ? "owl-dimmed" : ""}`} aria-label={dimmed ? "locked owl character" : "animated green owl mascot"} role="img"><div className="owl-motion"><div className="owl-ears" /><div className="owl-body"><span className="owl-wing left" /><span className="owl-wing right" /><div className="owl-eyes"><span className="owl-eye"><i /></span><span className="owl-eye"><i /></span></div><span className="owl-beak" /><span className={`owl-mouth ${mood}`} /></div><span className="owl-foot left" /><span className="owl-foot right" /></div></div>;
}

function SuperBird({ className = "" }: { className?: string }) {
  return <div className={`super-owl ${className}`} aria-label="Super Duolingo owl" role="img"><span className="super-owl-ear left" /><span className="super-owl-ear right" /><span className="super-owl-face"><i className="super-owl-eye left" /><i className="super-owl-eye right" /><b /></span><span className="super-owl-wing left" /><span className="super-owl-wing right" /><span className="super-owl-foot left" /><span className="super-owl-foot right" /></div>;
}

function SectionHeader({ unit, onGuide }: { unit: Unit; onGuide: () => void }) {
  return <div className="unit-header" style={{ backgroundColor: unit.color }}><div><div className="unit-kicker"><ArrowLeft size={21} /> SECTION 1, UNIT {unit.number}</div><h2>{unit.title}</h2></div><button className="guide-button" onClick={onGuide}><BookOpen size={25} /> GUIDEBOOK</button></div>;
}

function PathNode({ skill, index, unitIndex, color, onClick }: { skill: Skill; index: number; unitIndex: number; color: string; onClick: () => void }) {
  const firstCurve = [0, -55, -105, -105, -55, 0, 55, 105, 105, 55, 0];
  const nextCurve = [55, 105, 105, 55, 0, -55, -105, -105, -55, 0, 55];
  const shift = (unitIndex === 0 ? firstCurve : nextCurve)[index] ?? 0;
  return <div className={`path-item ${skill.state}`} data-skill-id={skill.id} style={{ transform: `translateX(${shift}px)` }}>
    {skill.state === "available" && <div className="path-tooltip">START</div>}
    <button className="path-node" style={skill.state !== "locked" ? { background: color } : undefined} onClick={onClick} aria-label={`${skill.title}: ${skill.state}`}>
      {skill.state === "completed" ? <Check size={42} strokeWidth={5} /> : skill.icon === "trophy" ? <Trophy size={36} fill="currentColor" /> : skill.icon === "book" ? <BookOpen size={36} fill="currentColor" /> : skill.icon === "headphones" ? <Headphones size={37} /> : skill.icon === "dumbbell" ? <Dumbbell size={36} /> : <Star size={37} fill="currentColor" />}
    </button>
    {skill.state === "available" && <span className="node-ring" />}
  </div>;
}

function RightRail({ data, page, setPage, onToast }: { data: Bootstrap; page: Page; setPage: (page: Page) => void; onToast: (text: string) => void }) {
  return <aside className="right-rail">
    {page === "leaderboards" ? <div className="rail-card status-card"><h3>Set your status</h3><div className="status-person">N <span>●</span></div><div className="status-grid">{["😎", "🎉", "💪", "👀", "🍿", "🇪🇸", "🐸", "💯", "💩", "🏆", "🧠", "🐱"].map(x => <button key={x} onClick={() => onToast(`Status set to ${x}`)}>{x}</button>)}</div></div> : page === "profile" ? <><div className="rail-card friends-card"><div className="friend-tabs"><button>FOLLOWING</button><button>FOLLOWERS</button></div><div className="friends-illustration">👩🏻‍🎤 🧑🏽‍🎨 👨🏻‍🍳 👩🏽‍🦱</div><p>Learning is more fun and effective<br />when you connect with others.</p></div><div className="rail-card"><h3>Add friends</h3><button className="friend-action" onClick={() => onToast("Friends are coming soon")}>🔎 <span>Find friends</span><ChevronRight /></button><button className="friend-action" onClick={() => onToast("Invite friends is coming soon")}>✉️ <span>Invite friends</span><ChevronRight /></button></div></> : <>
      {page !== "shop" && <div className="rail-card super-card"><div className="super-mark">SUPER</div><SuperBird className="super-bird" /><h3>Try Super for free</h3><p>No ads, personalized practice, and unlimited Legendary!</p><Button variant="purple" onClick={() => onToast("Super is coming soon")}>TRY 1 WEEK FREE</Button></div>}
      {page !== "quests" && <div className="rail-card league-card"><div className="rail-title"><h3>Bronze League</h3><button onClick={() => setPage("leaderboards")}>VIEW LEAGUE</button></div><div className="league-row"><span className="bronze-badge">🪶</span><div><strong>You’re ranked <em>#{data.leaderboard.findIndex(person => person.me) + 1}</em></strong><p>You&apos;ve earned {data.user.xp} XP this week so far</p></div></div></div>}
      <div className="rail-sticky-stack">
        {page !== "quests" && <div className="rail-card quest-card"><div className="rail-title"><h3>Daily Quests</h3><button onClick={() => setPage("quests")}>VIEW ALL</button></div><div className="quest-row"><span>⚡</span><div><strong>Earn 50 XP</strong><ProgressBar value={data.user.daily_xp} /><small>{Math.min(DAILY_QUEST_XP, data.user.daily_xp)} / {DAILY_QUEST_XP}</small></div><span>🧰</span></div></div>}
        <div className="ad-card"><SuperBird className="ad-bird" /><h3>Using an ad blocker?</h3><p>Support education with Super Duolingo and we’ll remove ads for you</p><Button variant="white" onClick={() => onToast("Super is coming soon")}>TRY SUPER FOR FREE</Button><button onClick={() => onToast("Thanks for supporting learning!")}>DISABLE AD BLOCKER</button></div>
        <div className="footer-links">ABOUT　 BLOG　 STORE　 EFFICACY　 CAREERS<br /><br /> INVESTORS　 TERMS　 PRIVACY</div>
      </div>
    </>}
    {(page === "leaderboards" || page === "profile") && <div className="footer-links">ABOUT　 BLOG　 STORE　 EFFICACY　 CAREERS<br /><br /> INVESTORS　 TERMS　 PRIVACY</div>}
  </aside>;
}

function Learn({ data, onStart, onGuide }: { data: Bootstrap; onStart: (skill: Skill) => void; onGuide: (unit: Unit) => void }) {
  const [showTop, setShowTop] = useState(false);
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const pathRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      setShowTop(window.scrollY > 450);
      const path = pathRef.current;
      if (!path) return;
      const headerBottom = path.querySelector(".path-header-sticky")?.getBoundingClientRect().bottom ?? 0;
      let current = 0;
      path.querySelectorAll(".path-unit").forEach((section, index) => {
        if (section.getBoundingClientRect().top <= headerBottom + 1) current = index;
      });
      setActiveUnitIndex(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [data.units]);
  const activeUnit = data.units[activeUnitIndex] ?? data.units[0];
  return <div className="learning-path" ref={pathRef}>
    <div className="path-header-sticky"><SectionHeader unit={activeUnit} onGuide={() => onGuide(activeUnit)} /></div>
    {data.units.map((unit, unitIndex) => <section className={`path-unit ${unitIndex % 2 ? "curve-reverse" : ""} ${unitIndex === 0 && unit.skills[0]?.state === "available" ? "fresh-start" : ""}`} key={unit.id}><div className="nodes-wrap">{unitIndex > 0 && <div className="path-item jump-item"><div className="path-tooltip" style={{ color: unit.color }}>JUMP HERE?</div><button className="path-node" style={{ background: unit.color }} onClick={() => onStart(unit.skills[0])} aria-label={`Jump to unit ${unit.number}`}><FastForward size={37} fill="currentColor" /></button></div>}{unit.skills.map((skill, index) => <Fragment key={skill.id}><PathNode skill={skill} index={index} unitIndex={unitIndex} color={unit.color} onClick={() => onStart(skill)} />{(index === 2 || index === 8) && <div className="path-chest" style={{ transform: `translateX(${unitIndex === 0 ? (index === 2 ? -105 : 105) : (index === 2 ? 105 : -105)}px)` }} aria-hidden="true"><span /></div>}</Fragment>)}<MascotAnimation name="learning" className={`path-learning-mascot ${unitIndex > 0 ? "dimmed" : ""}`} label="Duo learning and writing" fallback={<Owl size="small" dimmed={unitIndex > 0} />} /><div className="path-owl-lower"><Owl size="small" dimmed /></div></div>{unitIndex < data.units.length - 1 && <div className="unit-divider"><span>{data.units[unitIndex + 1].title}</span></div>}</section>)}
    {showTop && <button className="scroll-top" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp size={31} strokeWidth={4} /></button>}
  </div>;
}

function Practice({ onToast, onStart, data }: { onToast: (text: string) => void; onStart: (skill: Skill) => void; data: Bootstrap }) {
  return <div className="content-stack"><h1>Today’s Review</h1><div className="hero-card"><div className="super-mark">SUPER</div><h2>Perfect Pronunciation</h2><p>Finish this session to build confidence with speaking!</p><span className="hero-person">🗣️</span><Button variant="white" onClick={() => onToast("Speaking practice is coming soon")}>UNLOCK</Button></div><h2>Conversation</h2><div className="practice-card" onClick={() => onToast("Speaking practice is coming soon")}><div><h3>Speak <span className="super-mark">SUPER</span></h3><p>Improve your speaking skills with these phrases</p></div><span>🎙️</span></div><div className="practice-card" onClick={() => onToast("Audio practice is coming soon")}><div><h3>Listen <span className="super-mark">SUPER</span></h3><p>Boost your listening skills with an audio-only session</p></div><span>🎧</span></div><h2>Your collections</h2><div className="practice-card" onClick={() => onToast("Words collection is coming soon")}><div><h3>Words <span className="super-mark">SUPER</span></h3><p>Review your Spanish vocabulary at any time</p></div><span>🗂️</span></div><div className="practice-card" onClick={() => onStart(data.units.flatMap(u => u.skills).find(s => s.state === "available") || data.units[0].skills[0])}><div><h3>Stories</h3><p>Practice reading through a short lesson</p></div><span>📖</span></div></div>;
}

function Leaderboards({ data }: { data: Bootstrap }) {
  return <div className="leaderboard-page"><div className="league-icons"><span>🛡️</span><span>♟️</span><span>♟️</span><span>♟️</span></div><h1>Bronze League</h1><p>Top 11 advance to the next league</p><strong className="days-left">3 days</strong><div className="leader-list">{data.leaderboard.map((leader, i) => <div className={`leader-entry ${leader.me ? "mine" : ""}`} key={leader.name}><strong>{i + 1}</strong><span className="leader-avatar">{leader.avatar}</span><b>{leader.name}</b><span>{leader.xp} XP</span></div>)}</div></div>;
}

function Quests({ data }: { data: Bootstrap }) {
  return <div className="content-stack"><div className="quest-hero"><div><h1>Welcome!</h1><p>Complete quests to earn rewards! Quests refresh every day.</p></div><Owl /></div><div className="section-heading"><h2>Daily Quests</h2><b>◷ TODAY</b></div><div className="quest-large"><span>⚡</span><div><h3>Earn 50 XP</h3><ProgressBar value={data.user.daily_xp} /><small>{Math.min(DAILY_QUEST_XP, data.user.daily_xp)} / {DAILY_QUEST_XP}</small></div><span>🧰</span></div><div className="locked-quest"><LockKeyhole /> More quests unlock soon</div></div>;
}

function Shop({ data, onRefill, onToast }: { data: Bootstrap; onRefill: () => void; onToast: (text: string) => void }) {
  return <div className="content-stack"><div className="shop-hero"><h1>Start a family plan!</h1><p>Save on Super Duolingo when you learn with friends</p><Button variant="white" onClick={() => onToast("Family plans are coming soon")}>LEARN MORE</Button><span>👨‍👩‍👧‍👦</span></div><h2>Hearts</h2><div className="shop-row"><span>❤️</span><div><h3>Refill Hearts</h3><p>Get full hearts so you can worry less about making mistakes in a lesson</p></div><Button variant="outline" disabled={data.user.hearts === 5 || data.user.gems < 350} onClick={onRefill}>{data.user.hearts === 5 ? "FULL" : "💎 350"}</Button></div><div className="shop-row"><span>💖</span><div><h3>Unlimited Hearts</h3><p>Never run out of hearts with Super!</p></div><Button variant="outline" onClick={() => onToast("Super is coming soon")}>FREE TRIAL</Button></div><h2>Power-Ups</h2><div className="shop-row"><span>⚡</span><div><h3>Double XP Boost</h3><p>Earn extra XP in your next lessons</p></div><Button variant="outline" onClick={() => onToast("Power-ups are coming soon")}>SOON</Button></div></div>;
}

function Profile({ data, onToast, onSaveName }: { data: Bootstrap; onToast: (text: string) => void; onSaveName: (name: string) => Promise<void> }) {
  const user = data.user;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user.display_name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function saveName() {
    setSaving(true);
    setError("");
    try { await onSaveName(draft); setEditing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save your name"); }
    finally { setSaving(false); }
  }
  return <><div className="content-stack profile-page"><div className="profile-cover"><div className="profile-silhouette">+</div><button onClick={() => { setDraft(user.display_name); setEditing(true); }} aria-label="Edit profile"><Pencil size={21} /></button></div><h1>{user.display_name}</h1><div className="muted">Spanish learner</div><p>Joined {new Date(user.joined_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p><div className="profile-follow">0 Following　 0 Followers <span>🇪🇸</span></div><hr /><h2>Statistics</h2><div className="stat-grid"><div>🔥 <strong>{user.streak}</strong><small>Day streak</small></div><div>⚡ <strong>{user.xp}</strong><small>Total XP</small></div><div>🛡️ <strong>Bronze</strong><small>Current league</small></div><div>🏅 <strong>0</strong><small>Top 3 finishes</small></div></div><div className="section-heading"><h2>Achievements</h2><button onClick={() => onToast("All achievements shown below")}>VIEW ALL</button></div><div className="achievement-list"><Achievement emoji="🔥" title="Wildfire" count={`${Math.min(user.streak, 3)}/3`} value={user.streak} max={3} detail="Reach a 3 day streak" /><Achievement emoji="🧙" title="Sage" count={`${Math.min(user.xp, 100)}/100`} value={user.xp} max={100} detail="Earn 100 XP" /><Achievement emoji="🛡️" title="Champion" count="0/2" value={0} max={2} detail="Advance to the Silver League" /></div></div>{editing && <div className="modal-backdrop" onClick={() => setEditing(false)}><form className="modal profile-edit-modal" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void saveName(); }}><button type="button" className="modal-x" onClick={() => setEditing(false)} aria-label="Close"><X /></button><h1>Edit your profile</h1><label htmlFor="profile-name">Your name</label><input id="profile-name" autoFocus maxLength={40} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Your Name" />{error && <p className="profile-error">{error}</p>}<Button disabled={saving || !draft.trim()}>{saving ? "SAVING…" : "SAVE NAME"}</Button></form></div>}</>;
}

function Achievement({ emoji, title, count, value, max, detail }: { emoji: string; title: string; count: string; value: number; max: number; detail: string }) {
  return <div className="achievement"><span>{emoji}<small>LEVEL 1</small></span><div><div className="achievement-title"><h3>{title}</h3><span>{count}</span></div><ProgressBar value={value} max={max} /><p>{detail}</p></div></div>;
}

function LessonCharacter({ speaking, celebrating = false }: { speaking: boolean; celebrating?: boolean }) {
  return <svg className={`lesson-character junior ${celebrating ? "celebrating" : speaking ? "speaking" : ""}`} viewBox="0 0 130 180" role="img" aria-label={celebrating ? "Character celebrating your correct answer" : speaking ? "Character speaking" : "Lesson character"}>
    <ellipse cx="65" cy="171" rx="35" ry="8" fill="#344951" />
    <g className="junior-motion">
      <g className="character-legs"><path d="M54 135 L57 159 L47 163 M78 135 L77 159 L88 161" fill="none" stroke="#dd2559" strokeWidth="13" strokeLinecap="round" /><path d="M46 164 L59 159 M88 164 L77 160" fill="none" stroke="#ff7190" strokeWidth="11" strokeLinecap="round" /></g>
      <path d="M47 91 Q25 96 28 121 Q30 145 66 148 Q97 143 101 120 Q104 98 83 91Z" fill="#ed3263" />
      <path d="M42 102 Q23 105 29 125 L47 131" fill="none" stroke="#ed3263" strokeWidth="17" strokeLinecap="round" /><ellipse cx="47" cy="127" rx="10" ry="12" fill="#ffd2b0" />
      <g className="character-arm"><path d="M89 105 Q108 107 108 84" fill="none" stroke="#ed3263" strokeWidth="16" strokeLinecap="round" /><path d="M108 84 L110 73" stroke="#ffd2b0" strokeWidth="16" strokeLinecap="round" /><path d="M105 69 L109 61 L114 66" fill="#ffd2b0" /></g>
      <g className="character-head"><path d="M34 30 Q33 18 46 18 Q56 7 64 17 Q81 10 85 22 Q101 22 98 38 L98 74 L32 74Z" fill="#ffce46" /><rect x="33" y="31" width="65" height="65" rx="26" fill="#ffd2b0" /><path d="M31 44 Q30 20 52 23 L76 24 Q103 21 99 45 Q80 48 63 38 Q49 48 31 44Z" fill="#ffce46" /><path d="M32 32 L100 37" fill="none" stroke="#ed3263" strokeWidth="8" strokeLinecap="round" /><path d="M36 46 L36 58 M95 45 L95 59" stroke="#ffce46" strokeWidth="8" strokeLinecap="round" />
        <g className="character-eyes"><ellipse cx="51" cy="59" rx="5" ry="7" fill="#fff" /><ellipse cx="78" cy="59" rx="5" ry="7" fill="#fff" /><ellipse cx="53" cy="60" rx="2.5" ry="4" fill="#503344" /><ellipse cx="76" cy="60" rx="2.5" ry="4" fill="#503344" /></g>
        <path d="M61 70 Q66 76 70 70" stroke="#eca184" strokeWidth="3" fill="none" strokeLinecap="round" /><path className="junior-smile" d="M55 80 Q65 88 76 79" fill="none" stroke="#b96c65" strokeWidth="3" strokeLinecap="round" /><path className="junior-cheer-mouth" d="M54 77 Q65 81 77 77 Q75 94 65 93 Q55 93 54 77Z" fill="#883b48" /><path className="junior-cheer-mouth" d="M59 88 Q65 85 72 89" stroke="#f26c84" strokeWidth="4" fill="none" />
      </g>
    </g>
  </svg>;
}

function LessonPlayer({ lesson, onClose, onFinish, onHeartChange }: { lesson: Lesson; onClose: () => void; onFinish: (result: AnswerResult) => void; onHeartChange: (hearts: number) => void }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [words, setWords] = useState<number[]>([]);
  const [typed, setTyped] = useState("");
  const [pairs, setPairs] = useState<[string, string][]>([]);
  const [pairFirst, setPairFirst] = useState<string | null>(null);
  const [pairFlash, setPairFlash] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [hearts, setHearts] = useState(lesson.hearts);
  const [error, setError] = useState("");
  const [combo, setCombo] = useState(0);
  const [interlude, setInterlude] = useState<"combo" | "hard" | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const pronunciationRef = useRef<HTMLAudioElement>(null);
  const choiceAudioRef = useRef<HTMLAudioElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [index, interlude]);
  useEffect(() => {
    pronunciationRef.current?.pause();
    choiceAudioRef.current?.pause();
    window.speechSynthesis?.cancel();
    return () => { choiceAudioRef.current?.pause(); window.speechSynthesis?.cancel(); };
  }, [index]);
  const exercise = lesson.exercises[index];
  const payload = exercise?.payload || {};
  const isReferenceLesson = lesson.exercises[0]?.payload.reference_lesson === true;
  const options = (payload.choices || []) as { label: string; emoji?: string }[];
  const wordOptions = (payload.words || []) as string[];
  const matchPairs = (payload.pairs || []) as [string, string][];
  const matchRight = (payload.right_order || [...matchPairs].reverse().map(([, right]) => right)) as string[];
  const matched = (word: string) => pairs.some(pair => pair.includes(word));
  const phrase = String(payload.phrase || "");
  const language = exercise.type === "word_bank" ? "es-ES" : "en-US";
  const pronunciation = phrase ? pronunciationSource(phrase, language) : null;
  useEffect(() => {
    const audio = pronunciationRef.current;
    if (!audio || !pronunciation || interlude) return;
    audio.currentTime = 0;
    void audio.play().then(() => setSpeaking(true)).catch(() => setSpeaking(false));
    return () => audio.pause();
  }, [index, pronunciation, interlude]);

  function choosePicture(label: string) {
    if (busy || feedback) return;
    setSelected(label);
    speakOption(label, "es-ES");
  }

  function speakOption(label: string, spokenLanguage: "es-ES" | "en-US") {
    choiceAudioRef.current?.pause();
    pronunciationRef.current?.pause();
    window.speechSynthesis?.cancel();
    const fallback = () => {
      if (!("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(label);
      utterance.lang = spokenLanguage;
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    };
    const source = pronunciationSource(label, spokenLanguage);
    if (!source) { fallback(); return; }
    const audio = choiceAudioRef.current;
    if (!audio) { fallback(); return; }
    if (audio.getAttribute("src") !== source) audio.src = source;
    audio.currentTime = 0;
    void audio.play().catch(fallback);
  }

  function speak() {
    if (!phrase) return;
    const fallback = () => {
      if (!("speechSynthesis" in window)) { setError("Audio is unavailable in this browser"); setSpeaking(false); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = language;
      utterance.rate = 0.85;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    };
    setError(""); setSpeaking(true);
    if (!pronunciationRef.current || !pronunciation) { fallback(); return; }
    pronunciationRef.current.currentTime = 0;
    void pronunciationRef.current.play().catch(fallback);
  }

  function reset() { setSelected(null); setWords([]); setTyped(""); setPairs([]); setPairFirst(null); setPairFlash(null); setFeedback(null); setError(""); }
  function choosePair(word: string, side: "left" | "right") {
    if (matched(word)) return;
    speakOption(word, side === "right" ? "es-ES" : "en-US");
    if (side === "left") { playEffect("tap"); setPairFirst(word); return; }
    if (!pairFirst) return;
    const valid = matchPairs.some(([left, right]) => left === pairFirst && right === word);
    if (valid) { playEffect("tap"); setPairs([...pairs, [pairFirst, word]]); setPairFirst(null); }
    else { playEffect("wrong"); setPairFlash(word); window.setTimeout(() => setPairFlash(null), 500); setPairFirst(null); }
  }
  const answer = exercise.type === "word_bank" ? words.map(i => wordOptions[i]) : exercise.type === "type" ? typed : exercise.type === "match" ? pairs : selected;
  const canCheck = exercise.type === "word_bank" ? words.length > 0 : exercise.type === "type" ? typed.trim().length > 0 : exercise.type === "match" ? pairs.length === matchPairs.length : selected !== null;
  async function check(skip = false) {
    if ((!canCheck && !skip) || busy) return;
    setBusy(true);
    try {
      const result = await post<AnswerResult>(`/api/sessions/${lesson.session_id}/answer`, { exercise_id: exercise.id, answer: skip ? null : answer });
      setFeedback(result); setHearts(result.hearts); onHeartChange(result.hearts);
      setCombo(previous => result.correct ? previous + 1 : 0);
      playEffect(result.correct ? "correct" : "wrong");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check answer"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (isReferenceLesson && exercise.type === "match" && pairs.length === matchPairs.length && !feedback && !busy) {
      void check();
    }
  // Trigger once the last pair has been matched, using the updated answer state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs.length]);
  function next() {
    if (!feedback) return;
    if (feedback.complete || feedback.failed) { if (feedback.complete) playEffect("complete"); onFinish(feedback); return; }
    if (!interlude && (combo === 5 || combo === 10)) { playEffect("combo"); setInterlude("combo"); return; }
    if (!isReferenceLesson && !interlude && index + 1 === lesson.exercises.length - 1) { setInterlude("hard"); return; }
    setIndex(index + 1); reset();
    setInterlude(null);
  }
  return <div className={`lesson-overlay ${isReferenceLesson ? "reference-lesson" : ""} ${combo >= 10 ? "hot-combo" : combo >= 5 ? "warm-combo" : ""}`}><audio ref={pronunciationRef} src={pronunciation ?? undefined} preload="auto" onEnded={() => setSpeaking(false)} onPause={() => setSpeaking(false)} /><audio ref={choiceAudioRef} preload="none" /><div className="lesson-top"><button onClick={onClose} aria-label="Exit lesson"><X size={29} /></button><div className="lesson-progress-wrap">{combo >= 2 && <span className="combo-label">{combo} IN A ROW</span>}<div className="lesson-progress"><div style={{ width: `${((index + (feedback ? 1 : 0)) / lesson.exercises.length) * 100}%` }} /></div>{feedback?.correct && !interlude && <span key={exercise.id} className="progress-burst" aria-hidden="true" style={{ left: `${((index + 1) / lesson.exercises.length) * 100}%` }}><i /><b /><b /><b /></span>}</div><div className="lesson-hearts"><Heart fill="currentColor" /> {hearts}</div></div>{interlude ? <div className={`combo-interlude ${interlude === "hard" ? "hard-interlude" : ""}`}>{interlude === "combo" && <><div className="combo-burst burst-a">✦</div><div className="combo-burst burst-b">✦</div></>}<MascotAnimation name="duo-attack" className="challenge-mascot" label="Duo ready for a challenge" fallback={<Owl size="large" />} /><div className="combo-speech">{interlude === "hard" ? "Try the hardest exercises from this level!" : isReferenceLesson ? (combo === 10 ? "Good effort!" : "Awesome! You're working hard and learning new words!") : combo === 10 ? "Outstanding! 10 in a row!" : "Cool! 5 in a row!"}</div></div> : <div className="lesson-content" ref={contentRef}><div className="lesson-label">{payload.tag === "NEW WORD" ? "✦ NEW WORD" : isReferenceLesson ? "" : index >= Math.floor(lesson.exercises.length * .75) ? "◆ HARD EXERCISE" : `LESSON ${index + 1} OF ${lesson.exercises.length}`}</div><h1>{exercise.prompt}</h1>
    {exercise.type === "choice" && (payload.mode === "meaning" ? <><div className="meaning-prompt">{phrase}</div><div className="meaning-choices">{options.map((option, i) => <button className={selected === option.label ? "chosen" : ""} aria-pressed={selected === option.label} key={option.label} onClick={() => choosePicture(option.label)}><small>{i + 1}</small>{option.label}</button>)}</div></> : <div className="choice-grid">{options.map((option, i) => <button className={`choice-card ${selected === option.label ? "chosen" : ""}`} aria-pressed={selected === option.label} key={option.label} onClick={() => choosePicture(option.label)}><span>{option.emoji}</span><div>{option.label}<small>{i + 1}</small></div></button>)}</div>)}
    {exercise.type === "word_bank" && <><div className="speech-line"><LessonCharacter speaking={speaking} celebrating={feedback?.correct === true && !interlude} /><button type="button" className={`speech-bubble ${speaking ? "speaking" : ""}`} onClick={speak} aria-label={`Play pronunciation: ${phrase}`}><Volume2 size={25} /><span>{phrase}</span><i className="audio-wave" aria-hidden="true"><b /><b /><b /></i></button></div><WordBank options={wordOptions} selected={words} onChange={setWords} disabled={busy || !!feedback} /></>}
    {exercise.type === "match" && <div className="match-grid"><div>{matchPairs.map(([left]) => <button className={`${matched(left) ? "matched" : ""} ${pairFirst === left ? "chosen" : ""}`} key={left} onClick={() => choosePair(left, "left")}>{left}</button>)}</div><div>{matchRight.map(right => <button className={`${matched(right) ? "matched" : ""} ${pairFlash === right ? "wrong" : ""}`} key={right} onClick={() => choosePair(right, "right")}>{right}</button>)}</div></div>}
    {exercise.type === "fill_blank" && <div className="fill-exercise"><p>{String(payload.translation)}</p><div className="blank-sentence">{String(payload.before)} <span>{selected || "________"}</span>{String(payload.after)}</div><div className="fill-options">{((payload.choices || []) as string[]).map(word => <button key={word} onClick={() => setSelected(word)} className={selected === word ? "chosen" : ""}>{word}</button>)}</div></div>}
    {exercise.type === "type" && <div className="type-exercise"><div className="speech-line"><LessonCharacter speaking={speaking} celebrating={feedback?.correct === true && !interlude} /><button type="button" className={`speech-bubble ${speaking ? "speaking" : ""}`} onClick={speak} aria-label={`Play pronunciation: ${phrase}`}><Volume2 size={25} /><span>{phrase}</span><i className="audio-wave" aria-hidden="true"><b /><b /><b /></i></button></div><textarea aria-label="Type your answer" placeholder={String(payload.placeholder || "Type your answer")} value={typed} onChange={event => setTyped(event.target.value)} /></div>}
    {error && <div className="inline-error">{error}</div>}
  </div>}<div className={`lesson-footer ${feedback && !interlude ? feedback.correct ? "correct" : "incorrect" : ""}`}><div className="lesson-footer-inner"><div>{interlude ? null : feedback ? <div className="feedback-copy"><span className="feedback-icon">{feedback.correct ? <Check /> : <X />}</span><div><strong>{feedback.correct ? ["Excellent!", "Great job!", "Nice job!", "Correct!"][index % 4] : feedback.failed ? "Out of hearts" : "Not quite"}</strong><p>{feedback.correct ? <span className="feedback-actions">☾ TOO EASY　　 △ TOO DIFFICULT　　 ⚑ REPORT</span> : `Correct answer: ${Array.isArray(feedback.correct_answer) ? (Array.isArray(feedback.correct_answer[0]) ? "Match each translation" : feedback.correct_answer.join(" ")) : String(feedback.correct_answer)}`}</p></div></div> : <Button variant="outline" onClick={() => void check(true)}>SKIP</Button>}</div><Button disabled={busy || (!feedback && !canCheck)} onClick={feedback ? next : () => void check()}>{feedback ? "CONTINUE" : "CHECK"}</Button></div></div></div>;
}

type LessonReward = { sessionId: string; type: "complete" | "failed"; xp: number; accuracy: number; streak: number; streakAdvanced: boolean; previousXp: number; previousDailyXp: number; stage: "summary" | "streak" };

function StreakCalendar({ streak, className = "" }: { streak: number; className?: string }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today); day.setDate(today.getDate() - 6 + index);
    return { label: day.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2), active: index >= 7 - Math.min(7, streak) };
  });
  return <div className={`streak-calendar ${className}`}>{days.map((day, index) => <div className={day.active ? "active" : ""} key={index}><span>{day.label}</span><b>{day.active ? <Check size={21} strokeWidth={5} /> : null}</b></div>)}</div>;
}

function LessonCeremony({ reward, onContinue, onPractice, onToast }: { reward: LessonReward; onContinue: () => void; onPractice: () => void; onToast: (message: string) => void }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const closeReview = useCallback(() => setReviewOpen(false), []);
  const mainRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [contentScale, setContentScale] = useState(1);
  useLayoutEffect(() => {
    const main = mainRef.current;
    const body = bodyRef.current;
    if (!main || !body) return;
    const fitContent = () => {
      const style = getComputedStyle(main);
      const availableHeight = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setContentScale(Math.min(1, availableHeight / Math.max(1, body.offsetHeight)));
    };
    const observer = new ResizeObserver(fitContent);
    observer.observe(main);
    observer.observe(body);
    fitContent();
    return () => observer.disconnect();
  }, [reward.stage, reward.type]);
  const perfect = reward.accuracy === 100;
  const newBadges = [reward.previousXp < 100 && reward.previousXp + reward.xp >= 100 ? "Sage badge unlocked" : "", reward.streakAdvanced && reward.streak === 3 ? "Wildfire badge unlocked" : "", reward.previousDailyXp < DAILY_QUEST_XP && reward.previousDailyXp + reward.xp >= DAILY_QUEST_XP ? "Daily quest complete" : ""].filter(Boolean);
  return <div className="ceremony-overlay"><div className="ceremony-main" ref={mainRef}><div className="ceremony-body" ref={bodyRef} style={{ transform: `scale(${contentScale})` }}>{reward.type === "failed" ? <><div className="ceremony-failed-heart"><Heart fill="currentColor" size={116} /></div><h1>Out of hearts!</h1><p>Practice to earn a heart and keep learning.</p></> : reward.stage === "streak" ? <><div className="ceremony-flame"><Flame fill="currentColor" strokeWidth={1} /></div><div className="streak-number">{reward.streak}</div><h1 className="streak-title">day streak</h1><div className="streak-ceremony-card"><StreakCalendar streak={reward.streak} /><p>Practice each day so your streak won’t reset!</p></div></> : <><div className="ceremony-celebration"><span className="firework one">✦</span><span className="firework two">✦</span><span className="firework three">✦</span><div className="ceremony-mascot"><Owl size="large" /><span>🎧</span></div><div className="ceremony-friend">🧑🏻‍🎤</div><div className="ceremony-stage" /></div><h1>{perfect ? "Perfect lesson!" : "Lesson complete!"}</h1><p>{perfect ? "You made no mistakes in this lesson" : `You got ${reward.accuracy}% correct. Keep it up!`}</p><div className="reward-cards"><div className="reward-card xp"><span>TOTAL XP</span><strong><Zap fill="currentColor" /> +{reward.xp}</strong></div><div className="reward-card accuracy"><span>{perfect ? "AMAZING" : "ACCURACY"}</span><strong>🎯 {reward.accuracy}%</strong></div></div>{newBadges.length > 0 && <div className="new-badges">{newBadges.map(badge => <span key={badge}>✦ {badge}</span>)}</div>}</>}</div></div><aside className="ceremony-side"><div className="ad-card"><SuperBird className="ad-bird" /><h3>Using an ad blocker?</h3><p>Support education with Super Duolingo and we’ll remove ads for you</p><Button variant="white" onClick={() => onToast("Super is coming soon")}>TRY SUPER FOR FREE</Button><button onClick={() => onToast("Thanks for supporting learning!")}>DISABLE AD BLOCKER</button></div></aside><footer className="ceremony-footer"><div><Button variant="outline" disabled={!reward.sessionId} onClick={() => setReviewOpen(true)}>REVIEW LESSON</Button><Button variant={reward.stage === "streak" ? "blue" : "green"} onClick={reward.type === "failed" ? onPractice : onContinue}>{reward.type === "failed" ? "PRACTICE TO EARN A HEART" : "CONTINUE"}</Button></div></footer>{reviewOpen && <LessonReviewModal sessionId={reward.sessionId} onClose={closeReview} />}</div>;
}

export default function HomePage() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [page, setPage] = useState<Page>("learn");
  const [popover, setPopover] = useState<Popover>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [result, setResult] = useState<LessonReward | null>(null);
  const [guide, setGuide] = useState<Unit | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const reload = useCallback(async () => { try { setData(await api<Bootstrap>("/api/bootstrap")); if (firstVisitWelcome()) setWelcome(true); } catch (err) { setToast(err instanceof Error ? err.message : "Could not connect to API"); } }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(""), 4000); return () => window.clearTimeout(timeout); }, [toast]);
  function showToast(message: string) { setToast(message); }
  async function start(skill: Skill) {
    if (skill.state === "locked") { showToast("Complete the previous lesson to unlock this skill"); return; }
    setLoading(true);
    try { const started = await post<LessonStart>(`/api/lessons/${skill.lesson_id}/start`); setLesson({ ...started, title: skill.title }); }
    catch (err) { const message = err instanceof Error ? err.message : "Could not start lesson"; if (message === "Out of hearts" && data) setResult({ sessionId: "", type: "failed", xp: 0, accuracy: 0, streak: data.user.streak, streakAdvanced: false, previousXp: data.user.xp, previousDailyXp: data.user.daily_xp, stage: "summary" }); else showToast(message); }
    finally { setLoading(false); }
  }
  async function refill(kind: "practice" | "gems") {
    try { await post(kind === "practice" ? "/api/practice/refill" : "/api/hearts/refill"); await reload(); setResult(null); showToast(kind === "practice" ? "Practice complete! You earned a heart." : "Hearts refilled!"); }
    catch (err) { showToast(err instanceof Error ? err.message : "Could not refill hearts"); }
  }
  async function saveName(name: string) {
    await patch<{ display_name: string }>("/api/profile", { display_name: name });
    await reload();
    showToast("Your name has been updated");
  }
  function continueReward() {
    if (result?.type === "complete" && result.stage === "summary" && result.streakAdvanced) setResult({ ...result, stage: "streak" });
    else { setResult(null); void reload(); }
  }
  if (!data) return <div className="loading-screen"><MascotAnimation name="flying-bird" className="loading-bird" label="Duo flying while your learning path loads" fallback={<Owl />} /><h1>Loading your learning path…</h1><p>Preparing your next adventure.</p>{toast && <><button onClick={() => void reload()}>RETRY</button><span>{toast}</span></>}</div>;
  return <><div className="app-shell"><aside className={`sidebar ${menuOpen ? "open" : ""}`}><button className="wordmark" onClick={() => setPage("learn")}>duolingo</button><nav>{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => { setPage(item.id); setMenuOpen(false); setPopover(null); }}><NavIcon page={item.id} />{item.title}</button>)}<div className="more-wrap"><button className={`nav-item ${popover === "more" ? "active" : ""}`} onClick={() => setPopover(popover === "more" ? null : "more")}><NavIcon page="more" />MORE</button>{popover === "more" && <div className="more-menu"><button onClick={() => showToast("Duolingo English Test is coming soon")}>DUOLINGO ENGLISH TEST</button><button onClick={() => showToast("Podcast is coming soon")}>PODCAST</button><hr /><button onClick={() => showToast("Settings are coming soon")}>SETTINGS</button><button onClick={() => showToast("Help is coming soon")}>HELP</button><button onClick={() => showToast("Progress is saved in this browser")}>LOG OUT</button></div>}</div></nav></aside><div className="main-shell"><header className="topbar">
  <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu"><Menu /></button>
  <div className="topbar-items">
    <button className={popover === "language" ? "selected" : ""} onClick={() => setPopover(popover === "language" ? null : "language")}><span className="spain-flag" /> 1</button>
    <button className={popover === "streak" ? "selected" : ""} onClick={() => setPopover(popover === "streak" ? null : "streak")}><Flame className="fire" fill="currentColor" /> {data.user.streak}</button>
    <button className={popover === "gems" ? "selected" : ""} onClick={() => setPopover(popover === "gems" ? null : "gems")}><span className="gem-icon" /> {data.user.gems}</button>
    <button className={popover === "hearts" ? "selected" : ""} onClick={() => setPopover(popover === "hearts" ? null : "hearts")}><Heart className="hearts" fill="currentColor" /> {data.user.hearts}</button>
  </div>
  {popover && popover !== "more" && <div className={`stat-popover ${popover}`}>
    <button className="popover-close" onClick={() => setPopover(null)}><X size={18} /></button>
    {popover === "language" ? <><small>MY COURSES</small><h3>🇪🇸　Spanish</h3><button onClick={() => showToast("More courses are coming soon")}>＋　Add a new course</button></>
    : popover === "streak" ? <><div className="streak-popover-hero"><div><h2>{data.user.streak} day streak</h2><p>You have earned your longest streak ever!</p></div><Flame fill="currentColor" size={72} /></div><StreakCalendar streak={data.user.streak} /><div className="friend-streak"><span>🔥</span><div><strong>Friend Streaks</strong><p>0 active Friend Streaks</p><Button variant="white" onClick={() => showToast("Friend Streaks are coming soon")}>VIEW LIST</Button></div></div><div className="streak-society"><LockKeyhole /><div><strong>Streak Society</strong><p>Reach a 7 day streak to join the Streak Society and earn exclusive rewards.</p></div></div><Button variant="blue" onClick={() => { setPopover(null); setPage("profile"); }}>VIEW MORE</Button></>
    : popover === "gems" ? <><h2>💎 Gems</h2><p>You have {data.user.gems} gems</p><button onClick={() => { setPopover(null); setPage("shop"); }}>GO TO SHOP</button></>
    : <><h2>Hearts</h2><div className="five-hearts">{Array.from({ length: 5 }, (_, i) => <Heart key={i} fill={i < data.user.hearts ? "currentColor" : "none"} />)}</div><h3>{data.user.hearts === 5 ? "You have full hearts" : `${data.user.hearts} hearts left`}</h3><p>Keep on learning</p><button onClick={() => { setPopover(null); void refill("practice"); }}>PRACTICE TO EARN HEARTS</button><button onClick={() => { setPopover(null); setPage("shop"); }}>REFILL HEARTS　💎350</button></>}
  </div>}
</header><div className="columns"><main className="main-content">{page === "learn" && <Learn data={data} onStart={start} onGuide={setGuide} />}{page === "practice" && <Practice data={data} onStart={start} onToast={showToast} />}{page === "leaderboards" && <Leaderboards data={data} />}{page === "quests" && <Quests data={data} />}{page === "shop" && <Shop data={data} onRefill={() => void refill("gems")} onToast={showToast} />}{page === "profile" && <Profile data={data} onToast={showToast} onSaveName={saveName} />}</main><RightRail data={data} page={page} setPage={setPage} onToast={showToast} /></div></div></div>{loading && <div className="blocking-loader"><MascotAnimation name="flying-bird" className="starting-bird" label="Duo flying while your lesson loads" fallback={<Owl />} /><span role="status">Starting lesson…</span></div>}{guide && <div className="modal-backdrop" onClick={() => setGuide(null)}><div className="modal guide-modal" onClick={e => e.stopPropagation()}><button className="modal-x" onClick={() => setGuide(null)}><X /></button><BookOpen size={48} color={guide.color} /><h1>Unit {guide.number} guidebook</h1><p className="muted">{guide.title}</p><div className="guide-phrases"><h3>Key phrases</h3><p>Un sándwich — A sandwich</p><p>Un café — A coffee</p><p>Por favor — Please</p><p>Gracias — Thank you</p></div><Button onClick={() => setGuide(null)}>GOT IT</Button></div></div>}{lesson && <LessonPlayer lesson={lesson} onClose={() => { setLesson(null); void reload(); }} onHeartChange={hearts => setData(prev => prev ? { ...prev, user: { ...prev.user, hearts } } : null)} onFinish={answer => { setResult({ sessionId: lesson.session_id, type: answer.failed ? "failed" : "complete", xp: answer.xp_awarded, accuracy: answer.accuracy, streak: answer.streak, streakAdvanced: answer.streak_advanced, previousXp: data.user.xp, previousDailyXp: data.user.daily_xp, stage: "summary" }); setLesson(null); void reload(); }} />}{result && <LessonCeremony reward={result} onContinue={continueReward} onPractice={() => void refill("practice")} onToast={showToast} />}{welcome && <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><div className="welcome-card"><div className="welcome-sparkle one">✦</div><div className="welcome-sparkle two">✦</div><MascotAnimation name="learning" className="welcome-mascot" label="Duo learning and writing" fallback={<Owl />} /><h1 id="welcome-title">Welcome to Duolingo</h1><p>Your Spanish learning adventure starts here.</p><Button onClick={() => setWelcome(false)}>START LEARNING</Button></div></div>}{toast && <div className="toast">{toast}</div>}</>;
}
