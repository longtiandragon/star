"use client";

import { useEffect, useMemo, useState } from "react";

type Profile = {
  school: string;
  province: string;
};

type Problem = { solved: boolean; seconds: number; errors: number };
type Disqualification = "作弊" | "违规" | "新增作弊";
type Contestant = {
  rank: number;
  originalRank?: number | null;
  advancementRank?: number | null;
  previouslyAdvanced?: boolean;
  userId: number;
  nickname: string;
  passCount: number;
  finishTime: number;
  errors: number;
  problems: Problem[];
  profile: Profile;
  disqualification?: Disqualification;
};

type ContestData = {
  contest: {
    id: number;
    title: string;
    sponsor: string;
    startTime: number;
    endTime: number;
    sourceUrl: string;
  };
  stats: {
    total: number;
    originalTotal: number;
    excludedTotal: number;
    announcedExcludedTotal?: number;
    priorExcludedTotal: number;
    cheatingTotal: number;
    violationTotal: number;
    newCheatingTotal: number;
    questionCount: number;
    highestPass: number;
    priorAdvancerCount?: number;
    priorAdvancerCountWithinCutoff?: number;
    advancementCutoffRank?: number | null;
  };
  contestants: Contestant[];
  excludedContestants: Contestant[];
  exclusionSource: {
    articleUrl: string;
    pdfUrl: string;
    publishedAt: string;
  };
  updatedExclusionSource: {
    articleUrl: string;
    publishedAt: string;
  } | null;
  firstRoundAdvancementSource?: {
    articleUrl: string;
    pdfUrl: string;
  } | null;
  generatedAt: string;
};

type ViewMode = "ranking" | "excluded" | "new-cheating";

const PAGE_SIZE = 40;
const ADVANCE_LIMIT = 400;
const SNAPSHOT_REFRESH_INTERVAL = 5 * 60 * 1000;
const PROBLEM_COLORS = [
  { background: "#e998b6", color: "#4d2030" },
  { background: "#17623a", color: "#ffffff" },
  { background: "#ff7388", color: "#4b1b23" },
  { background: "#f5a000", color: "#422b00" },
  { background: "#2993cf", color: "#ffffff" },
  { background: "#9bcf3f", color: "#24330b" },
  { background: "#8a50c7", color: "#ffffff" },
  { background: "#f0d326", color: "#3b3300" },
];

type AwardThresholds = {
  goldEnd: number;
  silverEnd: number;
  bronzeEnd: number;
};

type Award = {
  label: "金牌" | "银牌" | "铜牌";
  tone: "rank-gold" | "rank-silver" | "rank-bronze";
};

function calculateAwardThresholds(total: number): AwardThresholds {
  return {
    goldEnd: Math.round(total * 0.05),
    silverEnd: Math.round(total * 0.15),
    bronzeEnd: Math.round(total * 0.3),
  };
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDuration(seconds: number) {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatContestTime(value?: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value)).replaceAll("/", "-");
}

function formatProblemTime(seconds: number) {
  return Math.max(1, Math.floor(seconds / 60));
}

function formatPenaltyMinutes(seconds: number) {
  return Math.floor(seconds / 60);
}

function getAward(rank: number, passCount: number, thresholds: AwardThresholds): Award | null {
  if (passCount === 0) return null;
  if (rank <= thresholds.goldEnd) return { label: "金牌", tone: "rank-gold" };
  if (rank <= thresholds.silverEnd) return { label: "银牌", tone: "rank-silver" };
  if (rank <= thresholds.bronzeEnd) return { label: "铜牌", tone: "rank-bronze" };
  return null;
}

function getDisqualificationTone(category: Disqualification) {
  if (category === "新增作弊") return "new-cheating";
  return category === "作弊" ? "cheating" : "violation";
}

export default function Home() {
  const [contestId, setContestId] = useState<547 | 548>(548);
  const [data, setData] = useState<ContestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [passFilter, setPassFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("ranking");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("contest") === "547") setContestId(547);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    setLoading(true);
    setData(null);
    setError("");
    const loadSnapshot = () => {
      fetch(`${basePath}/data/contest-${contestId}.json?v=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as ContestData & { error?: string };
          if (!response.ok) throw new Error(payload.error || "榜单读取失败");
          setData(payload);
          setError("");
        })
        .catch((loadError) => {
          if (loadError instanceof DOMException && loadError.name === "AbortError") return;
          setError(loadError instanceof Error ? loadError.message : "榜单读取失败");
        })
        .finally(() => setLoading(false));
    };
    loadSnapshot();
    const refreshTimer = window.setInterval(loadSnapshot, SNAPSHOT_REFRESH_INTERVAL);
    return () => {
      window.clearInterval(refreshTimer);
      controller.abort();
    };
  }, [contestId]);

  const activeContestants = useMemo(
    () => {
      if (viewMode === "ranking") return data?.contestants || [];
      if (viewMode === "new-cheating") {
        return (data?.excludedContestants || []).filter((item) => item.disqualification === "新增作弊");
      }
      return (data?.excludedContestants || []).filter((item) => item.disqualification !== "新增作弊");
    },
    [data, viewMode],
  );

  const schoolOptions = useMemo(() => {
    const counts = new Map<string, number>();
    activeContestants.forEach((contestant) => {
      const school = contestant.profile.school;
      if (school !== "-") counts.set(school, (counts.get(school) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
  }, [activeContestants]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return activeContestants.filter((contestant) => {
      const profile = contestant.profile;
      const matchesQuery = !normalized
        || contestant.nickname.toLowerCase().includes(normalized)
        || String(contestant.userId).includes(normalized)
        || profile.school.toLowerCase().includes(normalized)
        || profile.province.toLowerCase().includes(normalized);
      const matchesSchool = schoolFilter === "all" || profile.school === schoolFilter;
      const matchesPass = passFilter === "all" || contestant.passCount >= Number(passFilter);
      return matchesQuery && matchesSchool && matchesPass;
    });
  }, [activeContestants, passFilter, query, schoolFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const awardThresholds = useMemo(() => calculateAwardThresholds(data?.stats.total || 0), [data?.stats.total]);
  const { goldEnd, silverEnd, bronzeEnd } = awardThresholds;
  const problemStats = useMemo(() => Array.from({ length: data?.stats.questionCount || 8 }, (_, index) => (
    activeContestants.reduce((total, contestant) => total + (contestant.problems[index]?.solved ? 1 : 0), 0) || 0
  )), [activeContestants, data?.stats.questionCount]);
  const solvedGroupTones = useMemo(() => {
    const solvedCounts = Array.from(new Set(activeContestants.map((contestant) => contestant.passCount)))
      .sort((a, b) => b - a);
    return new Map(solvedCounts.map((solvedCount, index) => [solvedCount, index % 2]));
  }, [activeContestants]);

  function goToPage(nextPage: number) {
    const target = Math.min(totalPages, Math.max(1, Math.trunc(nextPage) || 1));
    setPage(target);
    setPageInput(String(target));
  }

  function clearFilters() {
    setQuery("");
    setSchoolFilter("all");
    setPassFilter("all");
    goToPage(1);
  }

  function switchView(nextView: ViewMode) {
    setViewMode(nextView);
    setQuery("");
    setSchoolFilter("all");
    setPassFilter("all");
    setPage(1);
    setPageInput("1");
  }

  function switchContest(nextId: 547 | 548) {
    if (nextId === contestId) return;
    window.history.replaceState({}, "", nextId === 548 ? window.location.pathname : `${window.location.pathname}?contest=547`);
    setContestId(nextId);
    switchView("ranking");
  }

  return (
    <main className="scoreboard-shell" id="top">
      <header className="site-header">
        <a className="board-brand" href="#top" aria-label="百度之星榜单首页">
          <span className="brand-mark">B*</span>
          <span><strong>BAIDU STAR</strong><small>CONTEST BOARD</small></span>
        </a>
        <nav className="header-nav" aria-label="页面导航">
          <a href="#standings">榜单</a>
          <a href="#standings" onClick={() => switchView("excluded")}>公示查询</a>
          <a href={`https://www.matiji.net/exam/contest/contestdetail/${contestId}`} target="_blank" rel="noreferrer">码蹄集原榜 ↗</a>
        </nav>
      </header>

      <section className="contest-head" aria-labelledby="contest-title">
        <div className="contest-switch" role="group" aria-label="切换比赛场次">
          <button type="button" aria-pressed={contestId === 548} onClick={() => switchContest(548)}>第二场 <small>9月19日</small></button>
          <button type="button" aria-pressed={contestId === 547} onClick={() => switchContest(547)}>第一场 <small>8月23日</small></button>
        </div>
        <div className="contest-identity">
          <h1 id="contest-title">{data?.contest.title || `2026 年百度之星程序设计大赛 初赛第${contestId === 548 ? "二" : "一"}场`}</h1>
          <p>{data?.contest.sponsor || "百度之星程序设计大赛组织委员会"}</p>
        </div>
        <div className="contest-timing">
          <strong>开始时间：{formatContestTime(data?.contest.startTime)}<sup>GMT+8</sup></strong>
          <span className="final-pill"><i /> FINISHED</span>
          <strong>结束时间：{formatContestTime(data?.contest.endTime)}<sup>GMT+8</sup></strong>
        </div>
        <div className="contest-progress" aria-label="比赛已结束"><span /></div>
        <div className="progress-labels"><strong>当前时间：03:00:00</strong><strong>剩余时间：00:00:00</strong></div>
      </section>

      <section className="award-overview" aria-label="名额概览">
        <article><small>有效排名</small><strong>{data ? formatNumber(data.stats.total) : "—"}</strong></article>
        <article data-tone="gold"><small>金牌 5%</small><strong>{data ? `1—${formatNumber(goldEnd)}` : "—"}</strong></article>
        <article data-tone="silver"><small>银牌 15%</small><strong>{data ? `${formatNumber(goldEnd + 1)}—${formatNumber(silverEnd)}` : "—"}</strong></article>
        <article data-tone="bronze"><small>铜牌 30%</small><strong>{data ? `${formatNumber(silverEnd + 1)}—${formatNumber(bronzeEnd)}` : "—"}</strong></article>
        <article data-tone="advance"><small>{contestId === 548 ? "第二场晋级线·参考" : "晋级参考"}</small><strong>{contestId === 548 && data?.stats.advancementCutoffRank ? `第 ${data.stats.advancementCutoffRank} 名` : `前 ${ADVANCE_LIMIT}`}</strong></article>
        <article data-tone="excluded"><small>已排除</small><strong>{data ? formatNumber(data.stats.excludedTotal) : "—"}</strong></article>
      </section>

      <section className="standings" id="standings" aria-labelledby="standings-title">
        <header className="board-head">
          <div>
            <span className="eyebrow">STANDINGS</span>
            <h2 id="standings-title">{viewMode === "ranking" ? "有效排名" : viewMode === "new-cheating" ? "新增作弊原排名" : contestId === 548 ? "第二场违规 / 作弊公示" : "首批违规 / 作弊原排名"}</h2>
            <p>{viewMode === "ranking" ? `排除${contestId === 548 ? "第二场" : "两批"}官方公示名单后重新排名 · 每页 40 人${contestId === 548 ? " · 首场已晋级选手不占第二场 400 个名额" : ""}` : "显示码蹄集原榜名次，不参与奖项与晋级 · 每页 40 人"}</p>
          </div>
          <div className="snapshot-time"><small>最后快照</small><strong>{data ? formatDateTime(data.generatedAt) : "读取中"}</strong></div>
        </header>

        <div className="view-switch" role="group" aria-label="榜单类型">
          <button type="button" aria-pressed={viewMode === "ranking"} onClick={() => switchView("ranking")}>有效榜单 <strong>{data ? formatNumber(data.stats.total) : "—"}</strong></button>
          <button type="button" aria-pressed={viewMode === "excluded"} onClick={() => switchView("excluded")}>{contestId === 548 ? "第二场违规 / 作弊" : "首批作弊 / 违规"} <strong>{data ? formatNumber(data.stats.priorExcludedTotal) : "—"}</strong></button>
          {contestId === 547 && <button type="button" aria-pressed={viewMode === "new-cheating"} onClick={() => switchView("new-cheating")}>新增作弊 <strong>{data ? formatNumber(data.stats.newCheatingTotal) : "—"}</strong></button>}
          {viewMode === "excluded" && data && <span className="official-notice">作弊 {data.stats.cheatingTotal} 人 · 违规 {data.stats.violationTotal} 人{contestId === 548 && data.stats.announcedExcludedTotal !== data.stats.excludedTotal ? ` · 当前原榜可查 ${data.stats.excludedTotal} 人，另 ${data.stats.announcedExcludedTotal! - data.stats.excludedTotal} 人原排名不可核实` : ""} · <a href={data.exclusionSource.articleUrl} target="_blank" rel="noreferrer">官方公示 ↗</a></span>}
          {viewMode === "new-cheating" && data?.updatedExclusionSource && <span className="official-notice new-cheating-notice">新增作弊 {data.stats.newCheatingTotal} 人 · <a href={data.updatedExclusionSource.articleUrl} target="_blank" rel="noreferrer">9月1日更新公示 ↗</a></span>}
        </div>

        {contestId === 548 && viewMode === "ranking" && data?.firstRoundAdvancementSource && (
          <p className="advancement-note">按<a href={data.firstRoundAdvancementSource.articleUrl} target="_blank" rel="noreferrer">第一场官方晋级名单 ↗</a>核对 ID：第二场有 {data.stats.priorAdvancerCount} 位首场已晋级选手，其中 {data.stats.priorAdvancerCountWithinCutoff} 位在本场前 {data.stats.advancementCutoffRank} 名，故本场 400 个候选名额顺延至第 {data.stats.advancementCutoffRank} 名。第二场晋级以官方最终名单为准。</p>
        )}

        <div className="board-tools">
          <label className="search-box">
            <span className="sr-only">搜索参赛者</span>
            <div><b>⌕</b><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); goToPage(1); }} placeholder="搜索昵称、ID、学校或地区" />{query && <button type="button" onClick={() => { setQuery(""); goToPage(1); }} aria-label="清空搜索">×</button>}</div>
          </label>
          <label><span className="sr-only">学校筛选</span><select value={schoolFilter} onChange={(event) => { setSchoolFilter(event.target.value); goToPage(1); }}><option value="all">全部学校 · {schoolOptions.length}</option>{schoolOptions.map(([school, count]) => <option value={school} key={school}>{school} · {count}</option>)}</select></label>
          <label><span className="sr-only">AC门槛</span><select value={passFilter} onChange={(event) => { setPassFilter(event.target.value); goToPage(1); }}><option value="all">全部 AC</option>{[6, 5, 4, 3, 2, 1].map((count) => <option value={count} key={count}>至少 {count} AC</option>)}</select></label>
          <div className="result-count"><strong>{formatNumber(filtered.length)}</strong><span>{viewMode === "ranking" ? "名有效选手" : "名公示选手"}</span>{(query || schoolFilter !== "all" || passFilter !== "all") && <button type="button" onClick={clearFilters}>重置</button>}</div>
        </div>

        {error ? (
          <div className="state"><span>DATA ERROR</span><h3>{error}</h3><p>请重新启动本地站点后再试。</p></div>
        ) : loading ? (
          <div className="loading-list">{Array.from({ length: 12 }, (_, index) => <div key={index} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="state"><span>NO MATCH</span><h3>没有符合条件的参赛者</h3><button type="button" onClick={clearFilters}>重置筛选</button></div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="xcpc-table">
                <caption className="sr-only">2026年百度之星初赛第{contestId === 548 ? "二" : "一"}场排名</caption>
                <thead>
                  <tr>
                    <th className="rank-column">{viewMode === "ranking" ? "排名" : "原排名"}</th>
                    <th className="school-column">学校 / 地区</th>
                    <th className="team-column">参赛者</th>
                    <th className="score-column">解题</th>
                    <th className="penalty-column">罚时</th>
                    {Array.from({ length: data?.stats.questionCount || 8 }, (_, index) => <th className="problem-column" key={index} style={PROBLEM_COLORS[index % PROBLEM_COLORS.length]}><strong>{String.fromCharCode(65 + index)}</strong><small>{problemStats[index]}</small></th>)}
                  </tr>
                </thead>
                <tbody>{pageRows.map((contestant) => {
                  const displayRank = viewMode !== "ranking" ? contestant.originalRank || "—" : contestant.rank;
                  const rise = viewMode === "ranking" ? (contestant.originalRank || contestant.rank) - contestant.rank : 0;
                  const award = viewMode === "ranking" ? getAward(contestant.rank, contestant.passCount, awardThresholds) : null;
                  const advanced = viewMode === "ranking" && (contestant.advancementRank ?? contestant.rank) <= ADVANCE_LIMIT && !contestant.previouslyAdvanced;
                  return (
                    <tr
                      key={contestant.userId}
                      data-award={award?.label || undefined}
                      data-disqualified={contestant.disqualification ? "true" : undefined}
                      data-solved-group={solvedGroupTones.get(contestant.passCount) || 0}
                      data-row-parity={(contestant.rank - 1) % 2}
                    >
                      <td className="rank-cell"><span className={`rank-number ${award?.tone || ""}`}>{displayRank}</span>{rise > 0 && <span className="rank-rise" title={`原榜第 ${contestant.originalRank} 名，上升 ${rise} 名至第 ${contestant.rank} 名`}><span aria-hidden="true">↗</span> 原 {contestant.originalRank} → {contestant.rank}</span>}<span className="badge-row">{award && <span className={`medal-badge ${award.tone}`}>{award.label}</span>}{advanced && <span className="advance-badge">晋级参考</span>}{contestant.previouslyAdvanced && <span className="prior-advance-badge" title="已列入第一场官方晋级名单，不占第二场名额">首场已晋级</span>}{contestant.disqualification && <span className={`status-badge status-${getDisqualificationTone(contestant.disqualification)}`}>{contestant.disqualification}</span>}</span></td>
                      <td><div className="school"><strong>{contestant.profile.school === "-" ? "学校未公开" : contestant.profile.school}</strong><span>{contestant.profile.province || "地区未公开"}</span></div></td>
                      <td><div className="team"><span className="team-avatar">{contestant.nickname.slice(0, 1).toUpperCase()}</span><div><strong>{contestant.nickname}</strong><small>ID {contestant.userId}</small></div></div></td>
                      <td className="solved-cell"><strong>{contestant.passCount}</strong><span>/{data?.stats.questionCount || 8}</span></td>
                      <td className="time-cell"><strong>{formatPenaltyMinutes(contestant.finishTime)}</strong><span>{contestant.errors ? `${contestant.errors} 次罚时` : ""}</span></td>
                      {contestant.problems.map((problem, index) => (
                        <td className="problem-cell" key={index} data-state={problem.solved ? "solved" : problem.errors ? "failed" : "empty"} title={`第 ${index + 1} 题：${problem.solved ? `通过，用时 ${formatDuration(problem.seconds)}，${problem.errors} 次罚时` : "未通过"}`}>
                          {problem.solved ? <><strong>+</strong><small>{problem.errors + 1}/{formatProblemTime(problem.seconds)}</small></> : problem.errors ? <><strong>-</strong><small>{problem.errors}</small></> : null}
                        </td>
                      ))}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>

            <div className="mobile-list">{pageRows.map((contestant) => {
              const displayRank = viewMode !== "ranking" ? contestant.originalRank || "—" : contestant.rank;
              const rise = viewMode === "ranking" ? (contestant.originalRank || contestant.rank) - contestant.rank : 0;
              const award = viewMode === "ranking" ? getAward(contestant.rank, contestant.passCount, awardThresholds) : null;
              const advanced = viewMode === "ranking" && (contestant.advancementRank ?? contestant.rank) <= ADVANCE_LIMIT && !contestant.previouslyAdvanced;
              return (
                <article
                  key={contestant.userId}
                  data-award={award?.label || undefined}
                  data-disqualified={contestant.disqualification ? "true" : undefined}
                  data-solved-group={solvedGroupTones.get(contestant.passCount) || 0}
                  data-row-parity={(contestant.rank - 1) % 2}
                >
                  <div className="mobile-head"><div className="rank-stack"><span className={`rank-number ${award?.tone || ""}`}>#{displayRank}</span>{rise > 0 && <span className="rank-rise" title={`上升 ${rise} 名`}><span aria-hidden="true">↗</span> 原 {contestant.originalRank} → {contestant.rank}</span>}<span className="badge-row">{award && <span className={`medal-badge ${award.tone}`}>{award.label}</span>}{advanced && <span className="advance-badge">晋级参考</span>}{contestant.previouslyAdvanced && <span className="prior-advance-badge" title="已列入第一场官方晋级名单，不占第二场名额">首场已晋级</span>}{contestant.disqualification && <span className={`status-badge status-${getDisqualificationTone(contestant.disqualification)}`}>{contestant.disqualification}</span>}</span></div><span className="mobile-score"><strong>{contestant.passCount}</strong><small>AC</small></span></div>
                  <div className="mobile-team"><span className="team-avatar">{contestant.nickname.slice(0, 1).toUpperCase()}</span><div><h3>{contestant.nickname}</h3><p>ID {contestant.userId}</p></div></div>
                  <div className="mobile-school"><strong>{contestant.profile.school === "-" ? "学校未公开" : contestant.profile.school}</strong><span>{contestant.profile.province || "地区未公开"}</span></div>
                  <div className="mobile-metrics"><span><small>总用时</small>{formatDuration(contestant.finishTime)}</span><span><small>罚次</small>{contestant.errors}</span></div>
                  <div className="problem-strip" aria-label={`${contestant.nickname}的解题情况`}>{contestant.problems.map((problem, index) => <span key={index} data-state={problem.solved ? "solved" : problem.errors ? "failed" : "empty"}>{String.fromCharCode(65 + index)}</span>)}</div>
                </article>
              );
            })}</div>

            <nav className="pagination" aria-label="榜单分页">
              <button type="button" disabled={page === 1} onClick={() => goToPage(page - 1)}>← 上一页</button>
              <div className="page-controls">
                <div className="page-status"><strong>{page}</strong><span>/ {totalPages}</span></div>
                <form onSubmit={(event) => { event.preventDefault(); goToPage(Number(pageInput)); }}>
                  <label className="sr-only" htmlFor="page-jump">跳转页码</label>
                  <input id="page-jump" type="number" min="1" max={totalPages} value={pageInput} onChange={(event) => setPageInput(event.target.value)} />
                  <button type="submit">跳转</button>
                </form>
              </div>
              <button type="button" disabled={page === totalPages} onClick={() => goToPage(page + 1)}>下一页 →</button>
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
