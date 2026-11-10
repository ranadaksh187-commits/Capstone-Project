import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  Flame,
  Flag,
  GraduationCap,
  Lightbulb,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const topics = ["All topics", "Computer Science", "Mathematics", "Physics", "Database Systems"];

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(localStorage.getItem("peerly-token")
          ? { Authorization: `Bearer ${localStorage.getItem("peerly-token")}` }
          : {}),
        ...options.headers,
      },
      ...options,
    });
  } catch (requestError) {
    if (requestError instanceof TypeError) {
      throw new Error("Cannot reach the Peerly API. Start the app with `npm run dev` from the project folder.");
    }
    throw requestError;
  }
  if (!response.ok) {
    const responseText = await response.text();
    let message = "";
    if (responseText) {
      try {
        const payload = JSON.parse(responseText);
        message = payload.error?.message || payload.message || "";
      } catch {
        message = "";
      }
    }
    if (!message) {
      message = response.status >= 500
        ? `The API returned an error (${response.status}). Check the backend terminal for details.`
        : responseText || `Request failed (${response.status})`;
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function initials(name = "") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function timeAgo(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Avatar({ name, color, size = "normal", anonymous = false }) {
  return (
    <div className={`avatar ${size} ${anonymous ? "anonymous" : ""}`} style={{ backgroundColor: color || "#dce9e4" }}>
      {anonymous ? <ShieldCheck size={size === "small" ? 14 : 17} /> : initials(name)}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("peerly-token") || "");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState("");
  const [doubts, setDoubts] = useState([]);
  const [peers, setPeers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [reports, setReports] = useState([]);
  const [subject, setSubject] = useState("All topics");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [posting, setPosting] = useState(false);
  const [activeNav, setActiveNav] = useState("Feed");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [doubtData, peerData, notificationData] = await Promise.all([
        api("/doubts"),
        api("/peers"),
        api("/notifications"),
      ]);
      setDoubts(doubtData);
      setPeers(peerData);
      setNotifications(notificationData);
      if (user?.role === "admin") {
        setReports(await api("/admin/reports"));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      if (!token) {
        setUser(null);
        setAuthLoading(false);
        setLoading(false);
        return;
      }
      setAuthLoading(true);
      try {
        const session = await api("/auth/me");
        if (!active) return;
        setUser(session.user);
      } catch {
        localStorage.removeItem("peerly-token");
        if (active) {
          setToken("");
          setUser(null);
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    }
    restoreSession();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (user) loadData();
  }, [loadData, user]);

  const filteredDoubts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return doubts.filter((doubt) => {
      const matchesTopic = subject === "All topics" || doubt.subject.toLowerCase() === subject.toLowerCase();
      const searchableText = `${doubt.title} ${doubt.description} ${doubt.subject} ${doubt.answers.map((answer) => answer.content).join(" ")}`;
      const matchesSearch = !needle || searchableText.toLowerCase().includes(needle);
      const matchesNav = activeNav === "Answer questions"
        ? doubt.status !== "resolved"
        : activeNav !== "Find my answer" || doubt.answers.length > 0;
      return matchesTopic && matchesSearch && matchesNav;
    });
  }, [activeNav, doubts, search, subject]);

  const answeredCount = doubts.filter((doubt) => doubt.status === "resolved").length;
  const answerableCount = doubts.filter((doubt) => doubt.status !== "resolved").length;
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const myProfile = user;
  const myAnswers = doubts.reduce((count, doubt) =>
    count + doubt.answers.filter((answer) => answer.isMine).length, 0);
  const bestPeers = useMemo(() => {
    if (subject !== "All topics") {
      const matching = peers.filter((peer) => peer.subjects.some((item) => item.toLowerCase() === subject.toLowerCase()));
      return [...matching, ...peers.filter((peer) => !matching.includes(peer))].slice(0, 3);
    }
    return peers.slice(0, 3);
  }, [peers, subject]);

  async function handleCreateDoubt(form) {
    setPosting(true);
    setError("");
    try {
      const createdDoubt = await api("/doubts", { method: "POST", body: JSON.stringify(form) });
      setDoubts((current) => [createdDoubt, ...current.filter((doubt) => doubt.id !== createdDoubt.id)]);
      setModalOpen(false);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleAnswer(doubtId, form) {
    try {
      await api(`/doubts/${doubtId}/answers`, { method: "POST", body: JSON.stringify(form) });
      await loadData();
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  }

  async function handleHelpful(answerId) {
    try {
      await api(`/doubts/answers/${answerId}/helpful`, { method: "PUT" });
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleAccept(answerId) {
    try {
      await api(`/doubts/answers/${answerId}/accept`, { method: "PUT" });
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function markNotificationRead(notificationId) {
    try {
      await api(`/notifications/${notificationId}/read`, { method: "PUT" });
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read: true } : item));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleAuth(path, form) {
    const session = await api(path, { method: "POST", body: JSON.stringify(form) });
    localStorage.setItem("peerly-token", session.token);
    setToken(session.token);
    setUser(session.user);
  }

  async function handleProfileUpdate(changes) {
    const result = await api("/auth/me", { method: "PATCH", body: JSON.stringify(changes) });
    setUser(result.user);
    setPeers((current) => current.map((peer) => peer.id === result.user.id ? { ...peer, ...result.user } : peer));
    setProfileOpen(false);
  }

  function handleLogout() {
    api("/auth/logout", { method: "POST" }).catch((requestError) => {
      setAuthNotice(`Signed out on this device. The server could not revoke the session: ${requestError.message}`);
    });
    localStorage.removeItem("peerly-token");
    setToken("");
    setUser(null);
    setDoubts([]);
    setPeers([]);
    setNotifications([]);
    setReports([]);
  }

  async function handleReport(target, form) {
    try {
      await api("/reports", {
        method: "POST",
        body: JSON.stringify({ ...target, ...form }),
      });
      setReportTarget(null);
      setError("");
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  }

  async function reviewReport(reportId, action) {
    try {
      await api(`/admin/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (authLoading) {
    return <div className="auth-loading"><span className="loader" /> Loading your Peerly account...</div>;
  }
  if (!user) {
    return <AuthScreen onSubmit={handleAuth} notice={authNotice} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Peerly home">
          <span className="brand-mark"><Sparkles size={20} strokeWidth={2.5} /></span>
          <span>peerly<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-center">
          <div className="search-box">
            <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find questions, answers, or peers..." />
            <kbd>⌘ K</kbd>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button notification-button" aria-label={`${unreadCount} unread notifications`} onClick={() => document.getElementById("updates")?.scrollIntoView({ behavior: "smooth" })}>
            <Bell size={19} />
            {unreadCount > 0 && <span className="notification-dot" />}
          </button>
          <button className="profile-chip" onClick={() => setProfileOpen(true)} aria-label="Edit your profile">
            <Avatar name={user.name} color="#f4d7bf" size="small" />
            <span>{user.name}</span>
            <ChevronDown size={14} className="muted-icon" />
          </button>
          <button className="icon-button" onClick={handleLogout} aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="page-layout">
        <aside className="left-sidebar">
          <div className="sidebar-label">YOUR SPACE</div>
          <nav className="side-nav">
            <button className={activeNav === "Feed" ? "nav-item active" : "nav-item"} onClick={() => setActiveNav("Feed")}>
              <MessageCircle size={18} /> <span>Community feed</span>
            </button>
            <button className={activeNav === "Answer questions" ? "nav-item active" : "nav-item"} onClick={() => {
              setActiveNav("Answer questions");
            }}>
              <CircleHelp size={18} /> <span>Answer questions</span>
              <span className="nav-count">{answerableCount}</span>
            </button>
            <button className={activeNav === "Find my answer" ? "nav-item active" : "nav-item"} onClick={() => setActiveNav("Find my answer")}>
              <Lightbulb size={18} /> <span>Find my answer</span>
            </button>
            <button className={activeNav === "Peers" ? "nav-item active" : "nav-item"} onClick={() => setActiveNav("Peers")}>
              <UsersRound size={18} /> <span>Find a peer</span>
            </button>
            {user.role === "admin" && <button className={activeNav === "Moderation" ? "nav-item active" : "nav-item"} onClick={() => setActiveNav("Moderation")}>
              <ShieldAlert size={18} /> <span>Admin moderation</span>
              <span className="nav-count">{reports.length}</span>
            </button>}
          </nav>

          <div className="sidebar-divider" />
          <div className="sidebar-label topics-label">EXPLORE TOPICS</div>
          <nav className="topic-nav">
            {topics.slice(1).map((topic, index) => (
              <button key={topic} className={`topic-nav-item ${subject === topic ? "selected" : ""}`} onClick={() => setSubject(subject === topic ? "All topics" : topic)}>
                <span className={`topic-dot topic-dot-${index}`} />{topic}
              </button>
            ))}
          </nav>

          <div className="sidebar-promo">
            <div className="promo-icon"><Lightbulb size={20} /></div>
            <p className="promo-title">You belong here.</p>
            <p className="promo-copy">No question is too small. Learn at your own pace, together.</p>
            <button className="text-link" onClick={() => setModalOpen(true)}>Ask your first question <ArrowRight size={14} /></button>
          </div>
          <div className="sidebar-footer">Made for curious minds <span>✳</span></div>
        </aside>

        <main className="main-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-spark">✳</span> YOUR LEARNING COMMUNITY</div>
              <h1>Good questions make<br className="desktop-break" /> <span>great things happen.</span></h1>
              <p className="welcome-copy">A kinder corner of the internet to ask, share, and figure it out together.</p>
            </div>
            <button className="ask-button" onClick={() => setModalOpen(true)}><Plus size={18} /> Ask a doubt</button>
          </section>

          <section className="hero-strip">
            <div className="hero-copy">
              <span className="hero-pill"><Sparkles size={13} /> A LITTLE HELP GOES A LONG WAY</span>
              <h2>Understand more.<br />Score with confidence.</h2>
              <p>Compare peer explanations, then find someone who can help it click.</p>
              <div className="hero-actions">
                <button className="hero-button" onClick={() => setActiveNav("Find my answer")}>Find an explanation <ArrowRight size={15} /></button>
                <button className="hero-button answer-questions-button" onClick={() => {
                  setSearch("");
                  setSubject("All topics");
                  setActiveNav("Answer questions");
                  document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" });
                }}>Answer a question <Send size={14} /></button>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
              <div className="art-card art-card-back"><span>💡</span><i /></div>
              <div className="art-card art-card-front"><div className="art-avatar">A</div><div><b>You've got this!</b><small>One step at a time</small></div><span className="art-heart">♥</span></div>
              <div className="art-sparkle sparkle-one">✦</div><div className="art-sparkle sparkle-two">✳</div>
            </div>
          </section>

          <section className="stats-row" aria-label="Community activity">
            <div className="stat-item"><span className="stat-icon mint"><MessageCircle size={17} /></span><div><strong>{doubts.length}</strong><span>community questions</span></div></div>
            <div className="stat-item"><span className="stat-icon peach"><CheckCheck size={17} /></span><div><strong>{answeredCount}</strong><span>questions resolved</span></div></div>
            <div className="stat-item"><span className="stat-icon lilac"><UsersRound size={17} /></span><div><strong>{peers.length}</strong><span>kind humans to help</span></div></div>
          </section>
          <section className="impact-card" aria-label="Your answering progress">
            <div className="impact-icon"><Flame size={19} /></div>
            <div className="impact-copy"><strong>Your impact</strong><span>{myAnswers} {myAnswers === 1 ? "answer" : "answers"} shared · {myProfile?.reputation || 0} helpful points</span></div>
            <span className="impact-reward">+10 points when marked helpful</span>
          </section>

          <section className="feed-section" id="feed">
            <div className="section-heading">
              <div>
                <h2>{activeNav === "Answer questions" ? "Questions you can help answer" : activeNav === "Find my answer" ? "Find my answer" : activeNav === "Peers" ? "Find a peer" : activeNav === "Moderation" ? "Admin moderation" : "The community board"}</h2>
                <p>{activeNav === "Answer questions" ? "Share what you know. Helpful answers build your profile and earn points." : activeNav === "Find my answer" ? "Compare real explanations shared by students and mentors." : activeNav === "Peers" ? "Explore people by topic, experience, and helpful points." : activeNav === "Moderation" ? "Review community reports and take action on content or accounts." : "Little breakthroughs start with a conversation."}</p>
              </div>
              {activeNav !== "Peers" && activeNav !== "Moderation" && <button className="sort-button" onClick={() => setDoubts((current) => [...current].reverse())}><ArrowDownWideNarrow size={16} /> Latest <ChevronDown size={14} /></button>}
            </div>
            {activeNav !== "Peers" && activeNav !== "Moderation" && <div className="filter-row">
              <button className={`filter-chip ${subject === "All topics" ? "chosen" : ""}`} onClick={() => setSubject("All topics")}>All topics</button>
              {topics.slice(1).map((topic) => <button key={topic} className={`filter-chip ${subject === topic ? "chosen" : ""}`} onClick={() => setSubject(subject === topic ? "All topics" : topic)}>{topic}</button>)}
            </div>}

            {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
            {activeNav === "Moderation" ? (
              <ModerationPanel reports={reports} onReview={reviewReport} />
            ) : activeNav === "Peers" ? (
              loading ? <div className="loading-state"><span className="loader" /> Finding your people...</div> : (
                <PeerDirectory
                  peers={peers}
                  search={search}
                  onSearchChange={setSearch}
                  subject={subject}
                  onSubjectChange={setSubject}
                  onHelpPeer={(peer) => {
                    setSearch("");
                    const matchingOpenTopic = peer.subjects.find((peerSubject) =>
                      doubts.some((doubt) => doubt.status !== "resolved" && doubt.subject.toLowerCase() === peerSubject.toLowerCase())
                    );
                    setSubject(matchingOpenTopic || "All topics");
                    setActiveNav("Answer questions");
                    window.setTimeout(() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" }), 0);
                  }}
                />
              )
            ) : activeNav === "Find my answer" && !loading && (
              <div className="answer-finder-tools">
                <label className="explore-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a concept or answer..." aria-label="Search answers" /></label>
                <div className="answer-finder-note"><Sparkles size={16} /><span>Search scans both questions and posted explanations. Mark the explanation that helped most to reward its author.</span></div>
              </div>
            )}
            {activeNav !== "Peers" && activeNav !== "Moderation" && (loading ? <div className="loading-state"><span className="loader" /> Gathering the community...</div> : filteredDoubts.length ? (
              <div className="doubt-list">
                {filteredDoubts.map((doubt) => <DoubtCard key={doubt.id} doubt={doubt} peers={peers} user={user} onAnswer={handleAnswer} onHelpful={handleHelpful} onAccept={handleAccept} onReport={(target) => setReportTarget(target)} prioritizeHelpful={activeNav === "Find my answer"} />)}
              </div>
            ) : (
              <div className="empty-state"><span className="empty-icon"><Search size={20} /></span><h3>{activeNav === "Find my answer" ? "No matching explanations yet" : "No questions found just yet"}</h3><p>{activeNav === "Find my answer" ? "Try another search or topic, or ask the community to explain it." : "Try another topic or be the first to ask."}</p><button className="outline-button" onClick={() => setModalOpen(true)}><Plus size={15} /> Ask a doubt</button></div>
            ))}
          </section>
          <footer className="mobile-footer">A little help goes a long way <span>✳</span></footer>
        </main>

        <aside className="right-sidebar">
          <section className="right-section" id="mentors">
            <div className="right-heading"><div><h3>Your people</h3><p>Good humans, great at explaining.</p></div><button className="plain-icon" aria-label="See all peers" onClick={() => setActiveNav("Peers")}><ArrowRight size={16} /></button></div>
            <div className="mentor-list">
              {bestPeers.map((peer, index) => (
                <div className="mentor-card" key={peer.id}>
                  <Avatar name={peer.name} color={peer.avatarColor} />
                  <div className="mentor-info"><strong>{peer.name}</strong><span>{peer.role}</span><small><Flame size={12} /> {peer.reputation.toLocaleString()} helpful points</small></div>
                  {index === 0 && <span className="mentor-match">BEST MATCH</span>}
                </div>
              ))}
            </div>
            <button className="see-peers" onClick={() => { setSubject(subject === "All topics" ? "Computer Science" : subject); setActiveNav("Peers"); }}>See matches for {subject === "All topics" ? "Computer Science" : subject} <ArrowRight size={14} /></button>
          </section>

          <section className="right-section leaderboard-section">
            <div className="right-heading"><div><h3>Kindness in action</h3><p>This week's helpful humans.</p></div><span className="trophy">✳</span></div>
            <div className="leaderboard">
              {peers.slice(0, 3).map((peer, index) => (
                <div className="leader-row" key={peer.id}>
                  <span className={`leader-rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
                  <Avatar name={peer.name} color={peer.avatarColor} size="small" />
                  <span className="leader-name">{peer.name.split(" ")[0]}</span>
                  <span className="leader-points">+{Math.floor(peer.reputation / 10)}</span>
                </div>
              ))}
            </div>
            <div className="kindness-note"><Sparkles size={15} /><span>Every helpful answer makes this place better.</span></div>
          </section>

          <section className="right-section updates-section" id="updates">
            <div className="right-heading"><div><h3>A little update</h3><p>Good things happening here.</p></div><span className="update-live"><i /> LIVE</span></div>
            {notifications.length ? (
              <div className="updates-list">
                {notifications.slice(0, 3).map((notification) => (
                  <button className={`update-item ${notification.read ? "is-read" : ""}`} key={notification.id} onClick={() => !notification.read && markNotificationRead(notification.id)}>
                    <span className={`update-icon ${notification.kind}`}><Check size={14} /></span>
                    <span><span>{notification.message}</span><small>{timeAgo(notification.createdAt)}</small></span>
                    {!notification.read && <i className="unread-dot" />}
                  </button>
                ))}
              </div>
            ) : <p className="no-updates">Your updates will show up here.</p>}
          </section>

          <div className="right-footer"><span>Be kind. Stay curious.</span><span>Community guidelines <ArrowRight size={12} /></span></div>
        </aside>
      </div>
      {modalOpen && <DoubtModal onClose={() => setModalOpen(false)} onSubmit={handleCreateDoubt} posting={posting} submissionError={error} />}
      {profileOpen && <ProfileModal user={user} onClose={() => setProfileOpen(false)} onSubmit={handleProfileUpdate} />}
      {reportTarget && <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} onSubmit={handleReport} />}
    </div>
  );
}

function DoubtCard({ doubt, peers, user, onAnswer, onHelpful, onAccept, onReport, prioritizeHelpful }) {
  const [showAnswerForm, setShowAnswerForm] = useState(false);
  const [showAnswers, setShowAnswers] = useState(true);
  const answerCount = doubt.answers.length;
  const resolved = doubt.status === "resolved";

  return (
    <article className="doubt-card">
      <div className="doubt-topline">
        <div className="question-author">
          <Avatar name={doubt.authorName} anonymous={doubt.anonymous} />
          <div><strong>{doubt.anonymous ? "Anonymous student" : doubt.authorName}</strong><span><Clock3 size={12} /> {timeAgo(doubt.createdAt)}</span></div>
        </div>
        <div className="question-labels"><span className="subject-label">{doubt.subject}</span><span className={`status-label ${resolved ? "resolved" : answerCount ? "answered" : ""}`}><i />{resolved ? "RESOLVED" : answerCount ? "ANSWERED" : "OPEN"}</span></div>
      </div>
      <h3 className="doubt-title">{doubt.title}</h3>
      <p className="doubt-description">{doubt.description}</p>
      <div className="doubt-actions">
        <button className="action-link" onClick={() => setShowAnswers((value) => !value)}><MessageCircle size={15} /> {answerCount} {answerCount === 1 ? "answer" : "answers"}</button>
        {!resolved && <button className="answer-question-button" onClick={() => setShowAnswerForm((value) => !value)}><Send size={14} /> Answer this question</button>}
        {!doubt.isMine && <button className="save-button" aria-label="Report question" title="Report question" onClick={() => onReport({ targetType: "doubt", targetId: doubt.id })}><Flag size={15} /></button>}
      </div>
      {showAnswers && answerCount > 0 && (
        <div className="answers-list">
          {(prioritizeHelpful ? [...doubt.answers].sort((left, right) => Number(right.helpful) - Number(left.helpful)) : doubt.answers).map((answer) => (
            <div className={`answer ${answer.helpful ? "helpful-answer" : ""}`} key={answer.id}>
              <div className="answer-avatar"><Avatar name={answer.authorName} color={peers.find((peer) => peer.name === answer.authorName)?.avatarColor} size="small" /></div>
              <div className="answer-content">
                <div className="answer-byline"><strong>{answer.authorName}</strong><span>{answer.authorRole}</span>{answer.isMine && <span className="helpful-tag">YOUR ANSWER</span>}{answer.accepted && <span className="helpful-tag"><Check size={11} /> ACCEPTED</span>}{answer.helpful && <span className="helpful-tag"><Check size={11} /> HELPFUL · {answer.helpfulCount}</span>}<time>{timeAgo(answer.createdAt)}</time></div>
                <p>{answer.content}</p>
                <div className="answer-controls">
                  {!answer.isMine && !answer.votedByMe && <button className="helpful-button" onClick={() => onHelpful(answer.id)}><Check size={13} /> This helped me</button>}
                  {doubt.isMine && !answer.accepted && <button className="helpful-button" onClick={() => onAccept(answer.id)}><Check size={13} /> Accept answer</button>}
                  {!answer.isMine && <button className="report-answer" onClick={() => onReport({ targetType: "answer", targetId: answer.id })} aria-label="Report answer"><Flag size={13} /> Report</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showAnswerForm && <AnswerForm user={user} onCancel={() => setShowAnswerForm(false)} onSubmit={async (form) => { if (await onAnswer(doubt.id, form)) setShowAnswerForm(false); }} />}
    </article>
  );
}

function AnswerForm({ user, onCancel, onSubmit }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    await onSubmit({ content });
    setSubmitting(false);
  }

  return (
    <form className="answer-form" onSubmit={submit}>
      <div className="answer-form-heading"><strong>Add a thoughtful answer</strong><span>Every perspective helps.</span></div>
      <p className="answer-author">Replying as <strong>{user.name}</strong> · {user.role}</p>
      <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Share an explanation, a hint, or what helped you..." rows={3} maxLength={3000} required />
      <p className="answer-points-note"><Flame size={13} /> Earn 10 helpful points when your explanation helps someone.</p>
      <div className="form-actions"><button type="button" className="cancel-button" onClick={onCancel}>Cancel</button><button className="submit-button" type="submit" disabled={submitting}>{submitting ? "Sending..." : "Post my answer"} <Send size={14} /></button></div>
    </form>
  );
}

function PeerDirectory({ peers, search, onSearchChange, subject, onSubjectChange, onHelpPeer }) {
  const needle = search.trim().toLowerCase();
  const matchingPeers = peers.filter((peer) => {
    const matchesSubject = subject === "All topics" || peer.subjects.some((item) => item.toLowerCase() === subject.toLowerCase());
    const matchesSearch = !needle || `${peer.name} ${peer.role} ${peer.bio} ${peer.subjects.join(" ")}`.toLowerCase().includes(needle);
    return matchesSubject && matchesSearch;
  });

  return (
    <div className="peer-directory">
      <div className="peer-directory-intro">
        <div className="peer-directory-icon"><UsersRound size={20} /></div>
        <div><strong>People who can help</strong><p>Choose a topic to find classmates and mentors with relevant experience.</p></div>
      </div>
      <label className="explore-search"><Search size={16} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search peers, subjects, or skills..." aria-label="Search peers" /></label>
      <div className="peer-filter-row">
        {topics.map((topic) => <button key={topic} className={`filter-chip ${subject === topic ? "chosen" : ""}`} onClick={() => onSubjectChange(topic)}>{topic}</button>)}
      </div>
      {matchingPeers.length ? (
        <div className="peer-directory-grid">
          {matchingPeers.map((peer, index) => (
            <article className="peer-profile-card" key={peer.id}>
              <div className="peer-profile-heading">
                <Avatar name={peer.name} color={peer.avatarColor} />
                {index === 0 && <span className="mentor-match">TOP MATCH</span>}
              </div>
              <h3>{peer.name}</h3>
              <span className="peer-role">{peer.role}</span>
              <p>{peer.bio}</p>
              <div className="peer-subjects">{[...peer.subjects, ...peer.skills].map((item) => <span key={item}>{item}</span>)}</div>
              <div className="peer-profile-footer"><span><Flame size={14} /> {peer.reputation.toLocaleString()} helpful points</span><button className="submit-button" onClick={() => onHelpPeer(peer)}>Help answer <ArrowRight size={14} /></button></div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><span className="empty-icon"><Search size={20} /></span><h3>No peers match that search</h3><p>Try another topic or search for a different subject.</p></div>
      )}
    </div>
  );
}

function DoubtModal({ onClose, onSubmit, posting, submissionError }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("Computer Science");
  const [anonymous, setAnonymous] = useState(false);

  function submit(event) {
    event.preventDefault();
    onSubmit({ title, description, subject, anonymous });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="doubt-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <div className="modal-symbol"><CircleHelp size={21} /></div>
        <div className="modal-eyebrow">ASK WITHOUT THE AWKWARD</div>
        <h2 id="modal-title">What's on your mind?</h2>
        <p className="modal-intro">Every question is a good question. Your community is here for you.</p>
        <form onSubmit={submit} className="doubt-form">
          <label className="field-label">Give your doubt a clear title
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. How does recursion actually work?" maxLength={180} required autoFocus />
          </label>
          <label className="field-label">Add a little more context
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What have you tried? Where did you get stuck?" rows={4} maxLength={3000} required />
          </label>
          <label className="field-label">Choose a topic
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>{topics.slice(1).map((topic) => <option key={topic}>{topic}</option>)}</select>
          </label>
          <label className="anonymous-toggle">
            <span className="toggle-copy"><span className="toggle-icon"><ShieldCheck size={17} /></span><span><strong>Ask anonymously</strong><small>Your identity stays private. Always.</small></span></span>
            <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
            <span className="toggle-track" />
          </label>
          {submissionError && <div className="modal-error" role="alert">{submissionError}</div>}
          <button className="submit-button modal-submit" type="submit" disabled={posting}>{posting ? "Posting your doubt..." : "Share with the community"} <ArrowRight size={16} /></button>
        </form>
        <p className="privacy-note"><ShieldCheck size={13} /> A kind, judgment-free space. That's the Peerly promise.</p>
      </section>
    </div>
  );
}

function AuthScreen({ onSubmit, notice }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [subjects, setSubjects] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile = {
        email,
        password,
        ...(mode === "register" ? {
          name,
          role,
          subjects: subjects.split(",").map((subject) => subject.trim()).filter(Boolean),
        } : {}),
      };
      await onSubmit(mode === "register" ? "/auth/register" : "/auth/login", profile);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand auth-brand" href="#" aria-label="Peerly home">
          <span className="brand-mark"><Sparkles size={20} strokeWidth={2.5} /></span>
          <span>peerly<span className="brand-period">.</span></span>
        </a>
        <div className="auth-intro">
          <div className="eyebrow">YOUR LEARNING COMMUNITY</div>
          <h1>{mode === "register" ? "Find your people." : "Welcome back."}</h1>
          <p>Ask a doubt, share what you know, and learn together.</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Account options">
          <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Sign in</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Create account</button>
        </div>
        {notice && <div className="modal-error auth-notice" role="status">{notice}</div>}
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && <>
            <label className="field-label">Your name
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={80} required />
            </label>
            <label className="field-label">I am a
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="student">Student</option>
                <option value="mentor">Mentor</option>
              </select>
            </label>
          </>}
          <label className="field-label">Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required />
          </label>
          <label className="field-label">Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 8 : 1} maxLength={72} required />
          </label>
          {mode === "register" && <label className="field-label">Subjects or skills <span className="field-hint">Separate with commas</span>
            <input value={subjects} onChange={(event) => setSubjects(event.target.value)} placeholder="e.g. Mathematics, Physics" />
          </label>}
          {error && <div className="modal-error" role="alert">{error}</div>}
          <button className="submit-button auth-submit" disabled={busy}>{busy ? "Please wait..." : mode === "register" ? "Create your account" : "Sign in"} <ArrowRight size={16} /></button>
        </form>
        <p className="auth-footnote"><ShieldCheck size={14} /> Your identity and data are protected.</p>
      </section>
    </main>
  );
}

function ProfileModal({ user, onClose, onSubmit }) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || "");
  const [subjects, setSubjects] = useState((user.subjects || []).join(", "));
  const [skills, setSkills] = useState((user.skills || []).join(", "));
  const [interests, setInterests] = useState((user.interests || []).join(", "));
  const [available, setAvailable] = useState(user.available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        name,
        bio,
        subjects: subjects.split(",").map((item) => item.trim()).filter(Boolean),
        skills: skills.split(",").map((item) => item.trim()).filter(Boolean),
        interests: interests.split(",").map((item) => item.trim()).filter(Boolean),
        available,
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="doubt-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <div className="modal-symbol"><UsersRound size={20} /></div>
        <div className="modal-eyebrow">YOUR PROFILE</div>
        <h2 id="profile-title">Tell your community about you</h2>
        <form className="doubt-form" onSubmit={submit}>
          <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required /></label>
          <label className="field-label">About you<textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={3} maxLength={500} placeholder="A little about your learning journey..." /></label>
          <label className="field-label">Subjects<input value={subjects} onChange={(event) => setSubjects(event.target.value)} placeholder="Mathematics, Physics" /></label>
          <label className="field-label">Skills<input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="Calculus, React" /></label>
          <label className="field-label">Interests<input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="Study groups, robotics" /></label>
          <label className="availability-toggle"><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} /> Available to help peers</label>
          {error && <div className="modal-error" role="alert">{error}</div>}
          <div className="form-actions"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="submit-button" disabled={busy}>{busy ? "Saving..." : "Save profile"} <Check size={15} /></button></div>
        </form>
      </section>
    </div>
  );
}

function ReportModal({ target, onClose, onSubmit }) {
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const success = await onSubmit(target, { reason, details });
    if (!success) setError("We couldn't submit the report. Please try again.");
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="doubt-modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <div className="modal-symbol"><Flag size={19} /></div>
        <div className="modal-eyebrow">COMMUNITY SAFETY</div>
        <h2 id="report-title">Report this {target.targetType}</h2>
        <p className="modal-intro">Reports are reviewed by a Peerly administrator.</p>
        <form className="doubt-form" onSubmit={submit}>
          <label className="field-label">Reason
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="misinformation">Misleading information</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field-label">Details <span className="field-hint">Optional</span>
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} maxLength={1000} />
          </label>
          {error && <div className="modal-error" role="alert">{error}</div>}
          <div className="form-actions"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="submit-button" disabled={busy}>{busy ? "Sending..." : "Submit report"} <Flag size={14} /></button></div>
        </form>
      </section>
    </div>
  );
}

function ModerationPanel({ reports, onReview }) {
  if (!reports.length) {
    return <div className="empty-state"><span className="empty-icon"><ShieldCheck size={20} /></span><h3>You're all caught up</h3><p>New community reports will appear here for review.</p></div>;
  }
  return (
    <div className="moderation-list">
      {reports.map((report) => (
        <article className="moderation-card" key={report.id}>
          <div className="moderation-heading">
            <span className="subject-label">{report.targetType} · {report.reason}</span>
            <time>{timeAgo(report.createdAt)}</time>
          </div>
          <p className="moderation-context">Reported by {report.reporter?.name || "Former member"} · Content by {report.content?.authorName || "Unknown member"}</p>
          {report.content?.doubtTitle && <strong className="moderation-question">{report.content.doubtTitle}</strong>}
          <pre className="moderation-content">{report.content?.text || "This content is no longer available."}</pre>
          {report.details && <p className="moderation-details">Report details: {report.details}</p>}
          <div className="moderation-actions">
            <button className="cancel-button" onClick={() => onReview(report.id, "dismiss")}>Dismiss</button>
            <button className="cancel-button" onClick={() => onReview(report.id, "suspend_user")} disabled={!report.content?.authorId}>Suspend author</button>
            <button className="submit-button" onClick={() => onReview(report.id, "remove_content")}>Remove content</button>
          </div>
        </article>
      ))}
    </div>
  );
}

export default App;
