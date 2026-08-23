import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const contestId = Number(process.argv[2] || 547);
const dataDir = resolve(process.argv[3] || "app/data");
const rankingPath = resolve(dataDir, `contest-${contestId}-ranking.json`);
const profilesPath = resolve(dataDir, `contest-${contestId}-profiles.json`);
const publicPath = resolve("public", "data", `contest-${contestId}.json`);
const baseUrl = "https://www.matiji.net/exam-back";
const headers = {
  "content-type": "application/x-www-form-urlencoded",
  referer: `https://www.matiji.net/exam/contest/contestdetail/${contestId}`,
  "user-agent": "Mozilla/5.0 (compatible; MatijiContestExplorer/1.0)",
};

async function postForm(path, values, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: new URLSearchParams(values),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (attempt < 2) {
      await new Promise((resolveRetry) => setTimeout(resolveRetry, 600 * 2 ** attempt));
      return postForm(path, values, attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSchool(value) {
  const school = typeof value === "string" ? value.trim().replace(/^\/+/, "") : "";
  return school.length >= 2 && school !== "未知" && !/^\d+$/.test(school) ? school : "-";
}

function classifySchool(school) {
  if (school === "-") return { stage: "undisclosed", stageLabel: "未公开", basis: "公开用户详情未提供学校" };
  if (/小学|幼儿园/.test(school)) return { stage: "school", stageLabel: "中小学", basis: "根据公开学校全称识别为基础教育学校" };
  if (/中学|高中|初中|附中|一中|二中|三中|四中|五中|六中|七中|八中|九中|十中|中等学校/.test(school)) {
    return { stage: "school", stageLabel: "中小学", basis: "根据公开学校全称识别为基础教育学校" };
  }
  if (/(大学|学院|研究生院|本科)/.test(school) && !/(职业大学|职业技术大学|职业学院|职业技术学院)/.test(school)) {
    return { stage: "university", stageLabel: "大学", basis: "根据公开学校全称识别为高等院校" };
  }
  if (/职业|职院|技工|技师学院|中专|技校|高等专科|职业技术|专科学校/.test(school)) {
    return { stage: "vocational", stageLabel: "职业院校", basis: "根据公开学校全称识别为职业教育院校" };
  }
  if (/大学|学院|研究生院|本科/.test(school)) {
    return { stage: "university", stageLabel: "大学", basis: "根据公开学校全称识别为高等院校" };
  }
  return { stage: "other", stageLabel: "其他", basis: "学校全称不足以明确识别学段" };
}

await mkdir(dataDir, { recursive: true });
const [matchPayload, rankingPayload] = await Promise.all([
  postForm("/pc/queryMatchById.do", { id: String(contestId) }),
  postForm("/pc/queryMatchRankListById.do", { matchId: String(contestId), start: "0", limit: "5000" }),
]);

if (matchPayload.error_no !== "0" || rankingPayload.error_no !== "0") {
  throw new Error(String(matchPayload.data || rankingPayload.data || "公开接口返回错误"));
}

const match = matchPayload.data || {};
const rows = rankingPayload.data?.datas || [];
const contestants = rows.map((row) => {
  const questions = Array.isArray(row.questionScoreList) ? row.questionScoreList : [];
  return {
    rank: Number(row.orderIndex || 0),
    userId: Number(row.userId),
    nickname: String(row.nickname || `选手 ${row.userId}`),
    passCount: Number(row.passCount || 0),
    finishTime: Number(row.finishTime || 0),
    errors: questions.reduce((sum, question) => sum + Number(question.errorCount || 0), 0),
    problems: Array.from({ length: Number(rankingPayload.total || 0) }, (_, index) => {
      const question = questions[index] || {};
      return {
        solved: Number(question.commitSpendTime || 0) > 0,
        seconds: Number(question.commitSpendTime || 0),
        errors: Number(question.errorCount || 0),
      };
    }),
  };
});

await writeFile(
  rankingPath,
  `${JSON.stringify({
    contest: {
      id: contestId,
      title: String(match.title || `码蹄集比赛 ${contestId}`),
      sponsor: String(match.sponsor || "码蹄集"),
      startTime: Number(match.startTime || 0),
      endTime: Number(match.endTime || 0),
      sourceUrl: `https://www.matiji.net/exam/contest/contestdetail/${contestId}`,
    },
    stats: {
      total: contestants.length,
      questionCount: Number(rankingPayload.total || 0),
      highestPass: contestants.reduce((max, item) => Math.max(max, item.passCount), 0),
    },
    contestants,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`,
);
console.log(`ranking ${contestants.length} -> ${rankingPath}`);

let existing = {};
try {
  existing = JSON.parse(await readFile(profilesPath, "utf8")).profiles || {};
} catch {
  existing = {};
}

const profiles = { ...existing };
for (const [userId, profile] of Object.entries(profiles)) {
  const school = normalizeSchool(profile.school);
  profiles[userId] = { ...profile, school, ...classifySchool(school) };
}
const pending = contestants.filter((item) => !profiles[item.userId]);
let cursor = 0;
let completed = contestants.length - pending.length;

async function saveProfiles() {
  await mkdir(dirname(profilesPath), { recursive: true });
  await writeFile(
    profilesPath,
    `${JSON.stringify({ contestId, generatedAt: new Date().toISOString(), profiles }, null, 2)}\n`,
  );
}

async function worker() {
  while (cursor < pending.length) {
    const contestant = pending[cursor++];
    try {
      const payload = await postForm("/pc/queryUserDetailById.do", { userId: String(contestant.userId) });
      if (payload.error_no !== "0") throw new Error(String(payload.data || "用户详情接口返回错误"));
      const detail = payload.data || {};
      const school = normalizeSchool(
        detail.userMatchRankEntity?.school && detail.userMatchRankEntity.school !== "-"
          ? detail.userMatchRankEntity.school
          : detail.school,
      );
      profiles[contestant.userId] = {
        school,
        province: typeof detail.province === "string" ? detail.province : "",
        ...classifySchool(school),
      };
    } catch {
      delete profiles[contestant.userId];
    }

    completed += 1;
    if (completed % 100 === 0 || completed === contestants.length) {
      await saveProfiles();
      console.log(`profiles ${completed}/${contestants.length}`);
    }
  }
}

await Promise.all(Array.from({ length: 10 }, () => worker()));
await saveProfiles();
await mkdir(dirname(publicPath), { recursive: true });
await writeFile(
  publicPath,
  `${JSON.stringify({
    contest: {
      id: contestId,
      title: String(match.title || `码蹄集比赛 ${contestId}`),
      sponsor: String(match.sponsor || "码蹄集"),
      startTime: Number(match.startTime || 0),
      endTime: Number(match.endTime || 0),
      sourceUrl: `https://www.matiji.net/exam/contest/contestdetail/${contestId}`,
    },
    stats: {
      total: contestants.length,
      questionCount: Number(rankingPayload.total || 0),
      highestPass: contestants.reduce((max, item) => Math.max(max, item.passCount), 0),
    },
    contestants: contestants.map((contestant) => ({
      ...contestant,
      profile: profiles[contestant.userId] || {
        school: "-",
        province: "",
        stage: "undisclosed",
        stageLabel: "未公开",
        basis: "公开用户详情暂时读取失败，将在下次更新时重试",
      },
    })),
    generatedAt: new Date().toISOString(),
  })}\n`,
);
console.log(`done ${Object.keys(profiles).length} profiles -> ${profilesPath}`);
console.log(`public snapshot -> ${publicPath}`);
