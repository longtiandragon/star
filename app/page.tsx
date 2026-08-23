"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = "university" | "school" | "vocational" | "other" | "undisclosed";
type StageFilter = "all" | Stage;

type Profile = {
  school: string;
  province: string;
  stage: Stage;
  stageLabel: string;
  basis: string;
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

const PAGE_SIZE = 36;
const STAGE_LABELS: Record<Stage, string> = {
  university: "大学",
  school: "中小学",
  vocational: "职业院校",
  other: "其他",
  undisclosed: "未公开",
};

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

function rankTone(rank: number) {
  if (rank === 1) return "rank-gold";
  if (rank === 2) return "rank-silver";
  if (rank === 3) return "rank-bronze";
  return "";
}

export default function Home() {
  const [data, setData] = useState<ContestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [passFilter, setPassFilter] = useState("all");
  const [page, setPage] = useState(1);

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

  const stageCounts = useMemo(() => {
    const counts: Record<Stage, number> = { university: 0, school: 0, vocational: 0, other: 0, undisclosed: 0 };
    data?.contestants.forEach((contestant) => { counts[contestant.profile.stage] += 1; });
    return counts;
  }, [data]);

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
      const matchesStage = stageFilter === "all" || profile.stage === stageFilter;
      const matchesSchool = schoolFilter === "all" || profile.school === schoolFilter;
      const matchesPass = passFilter === "all" || contestant.passCount >= Number(passFilter);
      return matchesQuery && matchesStage && matchesSchool && matchesPass;
    });
  }, [data, passFilter, query, schoolFilter, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const podium = data?.contestants.slice(0, 3) || [];
  const disclosed = (data?.stats.total || 0) - stageCounts.undisclosed;

  function clearFilters() {
    setQuery("");
    setStageFilter("all");
    setSchoolFilter("all");
    setPassFilter("all");
    setPage(1);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="百度之星选手雷达首页">
          <span className="brand-code">B*</span>
          <span><strong>选手雷达</strong><small>BAIDU STAR · MATIJI DATA</small></span>
        </a>
        <div className="top-actions">
          <span className="status"><i /> 公开数据快照</span>
          <a href="https://www.matiji.net/exam/contest/contestdetail/547" target="_blank" rel="noreferrer">码蹄集原榜 ↗</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="edition"><span>2026</span><b>PRELIMINARY 01</b><em>#547</em></div>
          <h1>百度之星<br /><span>初赛第一场</span></h1>
          <p>从公开榜单整理 {formatNumber(data?.stats.total || 4256)} 位参赛者的排名、解题数与用时，并补充公开用户详情中的学校与学段信息。</p>
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
        <article><small>PARTICIPANTS</small><strong>{data ? formatNumber(data.stats.total) : "4,256"}</strong><span>官方总榜参赛者</span></article>
        <article><small>SCHOOL DISCLOSED</small><strong>{data ? formatNumber(disclosed) : "—"}</strong><span>公开详情含学校</span></article>
        <article><small>UNIQUE SCHOOLS</small><strong>{data ? formatNumber(schoolOptions.length) : "—"}</strong><span>公开学校全称去重</span></article>
        <article className="accent"><small>RANKING RULE</small><strong>唯一总榜</strong><span>筛选不改变官方名次</span></article>
      </section>

      <section className="leaderboard" aria-labelledby="leaderboard-title">
        <div className="panel-head">
          <div><span>PARTICIPANT INDEX</span><h2 id="leaderboard-title">官方总榜索引</h2><p>{data?.contest.title || "2026年百度之星 初赛 第一场"}</p></div>
          <div className="snapshot-time"><small>资料快照</small><strong>{data ? formatDateTime(data.generatedAt) : "读取中"}</strong></div>
        </div>

        <div className="filters">
          <label className="search-box">
            <span>搜索参赛者</span>
            <div><b>/</b><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="昵称、ID、学校或省份" />{query && <button type="button" onClick={() => { setQuery(""); setPage(1); }} aria-label="清空搜索">×</button>}</div>
          </label>
          <label><span>学校</span><select value={schoolFilter} onChange={(event) => { setSchoolFilter(event.target.value); setPage(1); }}><option value="all">全部公开学校 · {schoolOptions.length}</option>{schoolOptions.map(([school, count]) => <option value={school} key={school}>{school} · {count}</option>)}</select></label>
          <label><span>AC 门槛</span><select value={passFilter} onChange={(event) => { setPassFilter(event.target.value); setPage(1); }}><option value="all">不限</option>{[6, 5, 4, 3, 2, 1].map((count) => <option value={count} key={count}>≥ {count} 题</option>)}</select></label>
        </div>

        <div className="stage-tabs" role="group" aria-label="学校学段资料筛选">
          {([[
            "all", "全部", data?.stats.total || 0,
          ], ["university", "大学", stageCounts.university], ["school", "中小学", stageCounts.school], ["vocational", "职业院校", stageCounts.vocational], ["other", "其他", stageCounts.other], ["undisclosed", "未公开", stageCounts.undisclosed]] as Array<[StageFilter, string, number]>).map(([value, label, count]) => (
            <button type="button" key={value} className={stageFilter === value ? "active" : ""} onClick={() => { setStageFilter(value); setPage(1); }} aria-pressed={stageFilter === value}>{label}<span>{formatNumber(count)}</span></button>
          ))}
        </div>

        <div className="result-rail">
          <p>找到 <strong>{formatNumber(filtered.length)}</strong> 位参赛者 <span>· 学段仅作资料筛选，名次始终使用官方总榜</span></p>
          {(query || stageFilter !== "all" || schoolFilter !== "all" || passFilter !== "all") && <button type="button" onClick={clearFilters}>清空筛选</button>}
        </div>

        {error ? (
          <div className="state"><span>DATA ERROR</span><h3>{error}</h3><p>请重新启动本地站点后再试。</p></div>
        ) : loading ? (
          <div className="loading-list">{Array.from({ length: 8 }, (_, index) => <div key={index} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="state"><span>NO MATCH</span><h3>没有符合条件的参赛者</h3><p>可以清空学校、学段或 AC 门槛。</p><button type="button" onClick={clearFilters}>重置筛选</button></div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">2026 年百度之星初赛第一场官方总榜</caption>
                <thead><tr><th>官方排名</th><th>参赛者</th><th>学校 / 学段</th><th>AC</th><th>总用时</th><th>罚次</th><th>解题轨迹</th></tr></thead>
                <tbody>{pageRows.map((contestant) => (
                  <tr key={contestant.userId}>
                    <td><span className={`rank-number ${rankTone(contestant.rank)}`}>{String(contestant.rank).padStart(4, "0")}</span></td>
                    <td><div className="person"><span>{contestant.nickname.slice(0, 1).toUpperCase()}</span><div><strong>{contestant.nickname}</strong><small>ID {contestant.userId}</small></div></div></td>
                    <td><div className="school"><strong>{contestant.profile.school === "-" ? "学校未公开" : contestant.profile.school}</strong><span>{contestant.profile.province ? `${contestant.profile.province} · ` : ""}<i data-stage={contestant.profile.stage} title={contestant.profile.basis}>{STAGE_LABELS[contestant.profile.stage]}</i></span></div></td>
                    <td><span className="ac"><strong>{contestant.passCount}</strong><small>/{data?.stats.questionCount || 8}</small></span></td>
                    <td><time>{formatDuration(contestant.finishTime)}</time></td>
                    <td><span className={contestant.errors ? "penalty" : "no-penalty"}>{contestant.errors}</span></td>
                    <td><div className="problem-strip" aria-label={`${contestant.nickname} 的解题轨迹`}>{contestant.problems.map((problem, index) => <span key={index} data-state={problem.solved ? (problem.errors ? "penalty" : "solved") : "empty"} title={`第 ${index + 1} 题：${problem.solved ? `通过，${problem.errors} 次罚次` : "未通过"}`}>{String.fromCharCode(65 + index)}</span>)}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            <div className="mobile-list">{pageRows.map((contestant) => (
              <article key={contestant.userId}>
                <div className="mobile-head"><span className={`rank-number ${rankTone(contestant.rank)}`}>#{contestant.rank}</span><span className="ac"><strong>{contestant.passCount}</strong> AC</span></div>
                <h3>{contestant.nickname}</h3><p>ID {contestant.userId}</p>
                <div className="mobile-school"><strong>{contestant.profile.school === "-" ? "学校未公开" : contestant.profile.school}</strong><span data-stage={contestant.profile.stage}>{contestant.profile.stageLabel}</span></div>
                <div className="mobile-metrics"><span><small>总用时</small>{formatDuration(contestant.finishTime)}</span><span><small>罚次</small>{contestant.errors}</span></div>
                <div className="problem-strip">{contestant.problems.map((problem, index) => <span key={index} data-state={problem.solved ? (problem.errors ? "penalty" : "solved") : "empty"}>{String.fromCharCode(65 + index)}</span>)}</div>
              </article>
            ))}</div>

            <nav className="pagination" aria-label="榜单分页">
              <button type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← 上一页</button>
              <div><strong>{String(page).padStart(2, "0")}</strong><span>/ {String(totalPages).padStart(2, "0")}</span></div>
              <button type="button" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>下一页 →</button>
            </nav>
          </>
        )}
      </section>

      <footer className="footer">
        <div><strong>数据口径</strong><p>排名、昵称、AC 数、用时和解题记录来自比赛公开总榜；学校与省份来自公开用户详情。学段根据公开学校全称识别，只用于资料筛选，不构成比赛分组，也不会重新计算名次。</p></div>
        <div><span>CONTEST #547</span><span>{formatNumber(data?.stats.total || 4256)} PUBLIC RANKS</span><span>NO TRACK DIVISION</span></div>
      </footer>
    </main>
  );
}
