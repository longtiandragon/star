"use client";

import { useEffect, useMemo, useState } from "react";

type Profile = {
  school: string;
  province: string;
};

type Problem = { solved: boolean; seconds: number; errors: number };
type Contestant = {
  rank: number;
  userId: number;
  nickname: string;
  passCount: number;
  finishTime: number;
  errors: number;
  problems: Problem[];
  profile: Profile;
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
  stats: { total: number; questionCount: number; highestPass: number };
  contestants: Contestant[];
  generatedAt: string;
};

const PAGE_SIZE = 40;
const ADVANCE_LIMIT = 400;

type AwardBands = {
  gold: number;
  silver: number;
  bronze: number;
};

type Award = {
  label: "金牌" | "银牌" | "铜牌";
  tone: "rank-gold" | "rank-silver" | "rank-bronze";
};

function calculateAwardBands(total: number): AwardBands {
  return {
    gold: Math.round(total * 0.05),
    silver: Math.round(total * 0.1),
    bronze: Math.round(total * 0.15),
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

function getAward(rank: number, passCount: number, bands: AwardBands): Award | null {
  if (passCount === 0) return null;
  if (rank <= bands.gold) return { label: "金牌", tone: "rank-gold" };
  if (rank <= bands.gold + bands.silver) return { label: "银牌", tone: "rank-silver" };
  if (rank <= bands.gold + bands.silver + bands.bronze) return { label: "铜牌", tone: "rank-bronze" };
  return null;
}

export default function Home() {
  const [data, setData] = useState<ContestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [passFilter, setPassFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  useEffect(() => {
    const controller = new AbortController();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    fetch(`${basePath}/data/contest-547.json`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as ContestData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "榜单读取失败");
        setData(payload);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "榜单读取失败");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const schoolOptions = useMemo(() => {
    const counts = new Map<string, number>();
    data?.contestants.forEach((contestant) => {
      const school = contestant.profile.school;
      if (school !== "-") counts.set(school, (counts.get(school) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
  }, [data]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.contestants || []).filter((contestant) => {
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
  }, [data, passFilter, query, schoolFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const podium = data?.contestants.slice(0, 3) || [];
  const awardBands = useMemo(() => calculateAwardBands(data?.stats.total || 0), [data?.stats.total]);
  const goldEnd = awardBands.gold;
  const silverEnd = goldEnd + awardBands.silver;
  const bronzeEnd = silverEnd + awardBands.bronze;

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

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="百度之星选手雷达首页">
          <span className="brand-code">B*</span>
          <span><strong>选手雷达</strong><small>BAIDU STAR · MATIJI DATA</small></span>
        </a>
        <div className="top-actions">
          <a href="https://www.matiji.net/exam/contest/contestdetail/547" target="_blank" rel="noreferrer">码蹄集原榜 ↗</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="edition"><span>2026</span><b>PRELIMINARY 01</b><em>#547</em></div>
          <h1>百度之星<br /><span>初赛第一场</span></h1>
          <div className="hero-meta">
            <span><small>比赛时间</small>08.23 · 14:00—17:00</span>
            <span><small>题目</small>{data?.stats.questionCount || 8} PROBLEMS</span>
            <span><small>最高通过</small>{data?.stats.highestPass || 6} AC</span>
          </div>
        </div>

        <aside className="radar-card" aria-label="榜首速览">
          <div className="radar-head"><span>OFFICIAL RANK SIGNAL</span><strong>TOP / 003</strong></div>
          <div className="leader-list">
            {(loading ? [null, null, null] : podium).map((leader, index) => leader ? (
              <article key={leader.userId}>
                <b>{String(leader.rank).padStart(2, "0")}</b>
                <span><strong>{leader.nickname}</strong><small>ID {leader.userId}</small></span>
                <span className="leader-score"><strong>{leader.passCount}</strong><small>AC</small></span>
                <time>{formatDuration(leader.finishTime)}</time>
              </article>
            ) : <div className="leader-skeleton" key={index} />)}
          </div>
          <div className="radar-grid" aria-hidden="true"><i /><i /><i /></div>
        </aside>
      </section>

      <section className="summary" aria-label="比赛概览">
        <article><small>参赛人数</small><strong>{data ? formatNumber(data.stats.total) : "—"}</strong></article>
        <article className="gold-card"><small>金牌 · 1—{goldEnd || "—"}</small><strong>{data ? formatNumber(awardBands.gold) : "—"}</strong></article>
        <article className="silver-card"><small>银牌 · {goldEnd ? goldEnd + 1 : "—"}—{silverEnd || "—"}</small><strong>{data ? formatNumber(awardBands.silver) : "—"}</strong></article>
        <article className="bronze-card"><small>铜牌 · {silverEnd ? silverEnd + 1 : "—"}—{bronzeEnd || "—"}</small><strong>{data ? formatNumber(awardBands.bronze) : "—"}</strong></article>
        <article className="advance-card"><small>晋级 · 前 {ADVANCE_LIMIT} 名</small><strong>{ADVANCE_LIMIT}</strong></article>
      </section>

      <section className="leaderboard" aria-labelledby="leaderboard-title">
        <div className="panel-head">
          <div><span>PARTICIPANT INDEX</span><h2 id="leaderboard-title">官方总榜索引</h2><p>{data?.contest.title || "2026年百度之星 初赛 第一场"}</p></div>
          <div className="snapshot-time"><small>资料快照</small><strong>{data ? formatDateTime(data.generatedAt) : "读取中"}</strong></div>
        </div>

        <div className="filters">
          <label className="search-box">
            <span>搜索参赛者</span>
            <div><b>/</b><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); goToPage(1); }} placeholder="昵称、ID、学校或省份" />{query && <button type="button" onClick={() => { setQuery(""); goToPage(1); }} aria-label="清空搜索">×</button>}</div>
          </label>
          <label><span>学校</span><select value={schoolFilter} onChange={(event) => { setSchoolFilter(event.target.value); goToPage(1); }}><option value="all">全部公开学校 · {schoolOptions.length}</option>{schoolOptions.map(([school, count]) => <option value={school} key={school}>{school} · {count}</option>)}</select></label>
          <label><span>AC 门槛</span><select value={passFilter} onChange={(event) => { setPassFilter(event.target.value); goToPage(1); }}><option value="all">不限</option>{[6, 5, 4, 3, 2, 1].map((count) => <option value={count} key={count}>≥ {count} 题</option>)}</select></label>
        </div>

        <div className="result-rail">
          <p><strong>{formatNumber(filtered.length)}</strong> 位参赛者</p>
          {(query || schoolFilter !== "all" || passFilter !== "all") && <button type="button" onClick={clearFilters}>清空筛选</button>}
        </div>

        {error ? (
          <div className="state"><span>DATA ERROR</span><h3>{error}</h3><p>请重新启动本地站点后再试。</p></div>
        ) : loading ? (
          <div className="loading-list">{Array.from({ length: 8 }, (_, index) => <div key={index} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="state"><span>NO MATCH</span><h3>没有符合条件的参赛者</h3><p>可以清空学校或 AC 门槛。</p><button type="button" onClick={clearFilters}>重置筛选</button></div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">2026 年百度之星初赛第一场官方总榜</caption>
                <thead><tr><th>排名 / 奖项</th><th>参赛者</th><th>学校 / 地区</th><th>AC</th><th>总用时</th><th>罚次</th><th>解题轨迹</th></tr></thead>
                <tbody>{pageRows.map((contestant) => {
                  const award = getAward(contestant.rank, contestant.passCount, awardBands);
                  const advanced = contestant.rank <= ADVANCE_LIMIT;
                  return (
                  <tr key={contestant.userId}>
                    <td><div className="rank-stack"><span className={`rank-number ${award?.tone || ""}`}>{String(contestant.rank).padStart(4, "0")}</span><span className="badge-row">{award && <span className={`medal-badge ${award.tone}`}>{award.label}</span>}{advanced && <span className="advance-badge">晋级</span>}</span></div></td>
                    <td><div className="person"><span>{contestant.nickname.slice(0, 1).toUpperCase()}</span><div><strong>{contestant.nickname}</strong><small>ID {contestant.userId}</small></div></div></td>
                    <td><div className="school"><strong>{contestant.profile.school === "-" ? "学校未公开" : contestant.profile.school}</strong><span>{contestant.profile.province || "地区未公开"}</span></div></td>
                    <td><span className="ac"><strong>{contestant.passCount}</strong><small>/{data?.stats.questionCount || 8}</small></span></td>
                    <td><time>{formatDuration(contestant.finishTime)}</time></td>
                    <td><span className={contestant.errors ? "penalty" : "no-penalty"}>{contestant.errors}</span></td>
                    <td><div className="problem-strip" aria-label={`${contestant.nickname} 的解题轨迹`}>{contestant.problems.map((problem, index) => <span key={index} data-state={problem.solved ? (problem.errors ? "penalty" : "solved") : "empty"} title={`第 ${index + 1} 题：${problem.solved ? `通过，${problem.errors} 次罚次` : "未通过"}`}>{String.fromCharCode(65 + index)}</span>)}</div></td>
                  </tr>
                  );
                })}</tbody>
              </table>
            </div>

            <div className="mobile-list">{pageRows.map((contestant) => {
              const award = getAward(contestant.rank, contestant.passCount, awardBands);
              const advanced = contestant.rank <= ADVANCE_LIMIT;
              return (
              <article key={contestant.userId}>
                <div className="mobile-head"><div className="rank-stack"><span className={`rank-number ${award?.tone || ""}`}>#{contestant.rank}</span><span className="badge-row">{award && <span className={`medal-badge ${award.tone}`}>{award.label}</span>}{advanced && <span className="advance-badge">晋级</span>}</span></div><span className="ac"><strong>{contestant.passCount}</strong> AC</span></div>
                <h3>{contestant.nickname}</h3><p>ID {contestant.userId}</p>
                <div className="mobile-school"><strong>{contestant.profile.school === "-" ? "学校未公开" : contestant.profile.school}</strong><span>{contestant.profile.province || "地区未公开"}</span></div>
                <div className="mobile-metrics"><span><small>总用时</small>{formatDuration(contestant.finishTime)}</span><span><small>罚次</small>{contestant.errors}</span></div>
                <div className="problem-strip">{contestant.problems.map((problem, index) => <span key={index} data-state={problem.solved ? (problem.errors ? "penalty" : "solved") : "empty"}>{String.fromCharCode(65 + index)}</span>)}</div>
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
