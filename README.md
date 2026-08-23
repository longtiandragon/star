# 百度之星选手雷达 · 比赛 547

这是一个独立的纯静态排名站点，数据来自码蹄集比赛 547 的公开比赛榜单与公开用户详情。

## 本地运行

```bash
npm install
npm run refresh:data
npm run dev
```

打开 `http://localhost:3000/`。

## 生成静态文件

```bash
npm run build:pages
```

静态产物位于 `out/`。页面只有官方总榜；学校与地区只用于资料检索，不会重新编号或计算分组排名。

## GitHub Pages

1. 将本目录提交到一个 GitHub 仓库的 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。
3. `.github/workflows/pages.yml` 会在推送时部署，也会按计划刷新公开排名后重新部署。

定时任务当前设为每 5 分钟尝试运行一次。GitHub Actions 的计划任务可能因平台负载延迟，因此它适合近实时榜单，不适合作为秒级实时服务。

学校详情首次已完整建立快照；后续任务每次刷新排名，只为新出现且没有缓存的用户读取公开详情。临时读取失败不会永久缓存，会在下次任务重试。
