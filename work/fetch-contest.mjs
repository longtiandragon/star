import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  contest547Exclusions,
  exclusionSource,
  updatedExclusionSource,
} from "./contest-547-exclusions.mjs";
import { contest548Exclusions, contest548ExclusionSource } from "./contest-548-exclusions.mjs";

const contestId = Number(process.argv[2] || 547);
const dataDir = resolve(process.argv[3] || "app/data");
const rankingPath = resolve(dataDir, `contest-${contestId}-ranking.json`);
const profilesPath = resolve(dataDir, `contest-${contestId}-profiles.json`);
const disqualifiedPath = resolve(dataDir, `contest-${contestId}-disqualified.json`);
const publicPath = resolve("public", "data", `contest-${contestId}.json`);
const baseUrl = "https://www.matiji.net/exam-back";
const headers = {
  accept: "application/json, text/plain, */*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
  referer: `https://www.matiji.net/exam/contest/contestdetail/${contestId}`,
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
};

async function requestJson(path, values, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const query = new URLSearchParams({
    ...values,
    _refresh: `${Date.now()}-${attempt}`,
  });
  try {
    const response = await fetch(`${baseUrl}${path}?${query}`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolveRetry) => setTimeout(resolveRetry, 1_000 * 2 ** attempt));
      return requestJson(path, values, attempt + 1);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path} 请求失败（重试 ${attempt + 1} 次）：${message}`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSchool(value) {
  const school = typeof value === "string" ? value.trim().replace(/^\/+/, "") : "";
  return school.length >= 2 && school !== "未知" && !/^\d+$/.test(school) ? school : "-";
}

function compareContestRanking(left, right) {
  return right.passCount - left.passCount
    || left.finishTime - right.finishTime
    || left.rank - right.rank
    || left.userId - right.userId;
}

await mkdir(dataDir, { recursive: true });
const [matchPayload, rankingPayload] = await Promise.all([
  requestJson("/pc/queryMatchById.do", { id: String(contestId) }),
  requestJson("/pc/queryMatchRankListById.do", { matchId: String(contestId), start: "0", limit: "5000" }),
]);

if (matchPayload.error_no !== "0" || rankingPayload.error_no !== "0") {
  throw new Error(String(matchPayload.data || rankingPayload.data || "公开接口返回错误"));
}

const match = matchPayload.data || {};
const rows = rankingPayload.data?.datas || [];
const sourceContestants = rows.map((row) => {
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
})
  .sort((left, right) => left.rank - right.rank || compareContestRanking(left, right));

let excludedContestants;
let excludedUserIds;
if (contestId === 548) {
  const byUserId = new Map(sourceContestants.map((item) => [item.userId, item]));
  excludedContestants = contest548Exclusions.map(({ userId, category }) => {
    const contestant = byUserId.get(userId);
    return {
      ...(contestant || {
        rank: 0, userId, nickname: userId === 156621 ? "lxy0417" : `小码_${userId}`, passCount: 0,
        finishTime: 0, errors: 0, problems: Array.from({ length: Number(rankingPayload.total || 0) }, () => ({ solved: false, seconds: 0, errors: 0 })),
      }),
      originalRank: contestant?.rank || null,
      disqualification: category,
    };
  }).sort((left, right) => (left.originalRank ?? Infinity) - (right.originalRank ?? Infinity) || left.userId - right.userId);
  excludedUserIds = new Set(contest548Exclusions.map((item) => item.userId));
  if (excludedUserIds.size !== contest548Exclusions.length) throw new Error("第二场官方名单存在重复用户 ID");
} else if (contestId === 547) {
  const disqualifiedArchive = JSON.parse(await readFile(disqualifiedPath, "utf8"));
  const archivedExcludedContestants = Array.isArray(disqualifiedArchive.excludedContestants)
    ? disqualifiedArchive.excludedContestants
    : [];
  const currentContestantsByNickname = new Map(sourceContestants.map((contestant) => [contestant.nickname, contestant]));
  excludedContestants = archivedExcludedContestants.map((archived) => {
    const current = currentContestantsByNickname.get(archived.nickname);
    if (!current) return archived;
    return { ...current, profile: archived.profile, originalRank: current.rank, disqualification: archived.disqualification };
  }).sort((left, right) => (left.originalRank ?? left.rank) - (right.originalRank ?? right.rank));
  if (excludedContestants.length !== contest547Exclusions.length) {
    throw new Error(`作弊/违规档案应为 ${contest547Exclusions.length} 人，当前为 ${excludedContestants.length} 人`);
  }
  const expectedExclusions = new Map(contest547Exclusions.map((item) => [item.nickname, item.category]));
  for (const contestant of excludedContestants) {
    if (expectedExclusions.get(contestant.nickname) !== contestant.disqualification) {
      throw new Error(`作弊/违规档案与官方名单不一致：${contestant.nickname}`);
    }
  }
  excludedUserIds = new Set(sourceContestants.filter((item) => expectedExclusions.has(item.nickname)).map((item) => item.userId));
} else {
  throw new Error(`尚未配置比赛 ${contestId} 的官方违规名单`);
}

const firstRoundAdvancement = contestId === 548
  ? JSON.parse(await readFile(resolve("work", "contest-547-advancers.json"), "utf8"))
  : null;
if (firstRoundAdvancement && firstRoundAdvancement.advancers.length !== 400) {
  throw new Error("首场官方晋级名单应有 400 人");
}
const priorAdvancerIds = new Set(firstRoundAdvancement?.advancers
  .map((item) => item.userId).filter((userId) => Number.isInteger(userId)) || []);
if (firstRoundAdvancement && priorAdvancerIds.size !== firstRoundAdvancement.advancers.filter((item) => item.userId !== null).length) {
  throw new Error("首场官方晋级名单存在重复用户 ID");
}
let advancementCursor = 0;
const contestants = sourceContestants
  .filter((item) => !excludedUserIds.has(item.userId))
  .map((item, index) => {
    const previouslyAdvanced = priorAdvancerIds.has(item.userId);
    return {
      ...item, originalRank: item.rank, rank: index + 1,
      previouslyAdvanced,
      advancementRank: previouslyAdvanced ? null : ++advancementCursor,
    };
  });
const activeExcludedCount = sourceContestants.length - contestants.length;
const advancementCutoffRank = contestants.find((item) => item.advancementRank === 400)?.rank || null;
const stats = {
  total: contestants.length,
  originalTotal: sourceContestants.length,
  excludedTotal: activeExcludedCount,
  announcedExcludedTotal: excludedContestants.length,
  priorExcludedTotal: excludedContestants.filter((item) => item.disqualification !== "新增作弊").length,
  cheatingTotal: excludedContestants.filter((item) => item.disqualification === "作弊").length,
  violationTotal: excludedContestants.filter((item) => item.disqualification === "违规").length,
  newCheatingTotal: excludedContestants.filter((item) => item.disqualification === "新增作弊").length,
  questionCount: Number(rankingPayload.total || 0),
  highestPass: contestants.reduce((max, item) => Math.max(max, item.passCount), 0),
  priorAdvancerCount: contestants.filter((item) => item.previouslyAdvanced).length,
  priorAdvancerCountWithinCutoff: contestants.filter((item) => item.previouslyAdvanced && item.rank <= advancementCutoffRank).length,
  advancementCutoffRank,
};

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
    stats,
    contestants,
    excludedContestants,
    exclusionSource: contestId === 548 ? contest548ExclusionSource : exclusionSource,
    updatedExclusionSource: contestId === 548 ? null : updatedExclusionSource,
    firstRoundAdvancementSource: firstRoundAdvancement?.source || null,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`,
);
console.log(`ranking ${contestants.length} eligible, ${excludedContestants.length} excluded -> ${rankingPath}`);

let existing = {};
try {
  existing = JSON.parse(await readFile(profilesPath, "utf8")).profiles || {};
} catch {
  existing = {};
}

const profiles = { ...existing };
for (const [userId, profile] of Object.entries(profiles)) {
  profiles[userId] = {
    school: normalizeSchool(profile.school),
    province: typeof profile.province === "string" ? profile.province : "",
  };
}
const pending = sourceContestants.filter((item) => !profiles[item.userId]);
let cursor = 0;
let completed = sourceContestants.length - pending.length;

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
      const payload = await requestJson("/pc/queryUserDetailById.do", { userId: String(contestant.userId) });
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
      };
    } catch {
      delete profiles[contestant.userId];
    }

    completed += 1;
    if (completed % 100 === 0 || completed === sourceContestants.length) {
      await saveProfiles();
      console.log(`profiles ${completed}/${sourceContestants.length}`);
    }
  }
}

await Promise.all(Array.from({ length: 16 }, () => worker()));
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
    stats,
    contestants: contestants.map((contestant) => ({
      ...contestant,
      profile: profiles[contestant.userId] || {
        school: "-",
        province: "",
      },
    })),
    excludedContestants: excludedContestants.map((contestant) => ({
      ...contestant,
      profile: contestant.profile || profiles[contestant.userId] || { school: "-", province: "" },
    })),
    exclusionSource: contestId === 548 ? contest548ExclusionSource : exclusionSource,
    updatedExclusionSource: contestId === 548 ? null : updatedExclusionSource,
    firstRoundAdvancementSource: firstRoundAdvancement?.source || null,
    generatedAt: new Date().toISOString(),
  })}\n`,
);
console.log(`done ${Object.keys(profiles).length} profiles -> ${profilesPath}`);
console.log(`public snapshot -> ${publicPath}`);
