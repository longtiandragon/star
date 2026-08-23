import type { Metadata } from "next";
import "./globals.css";

function deploymentUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const [owner, repository] = (process.env.GITHUB_REPOSITORY || "").split("/");
  if (!owner || !repository) return "http://localhost:3000";
  if (repository.endsWith(".github.io")) return `https://${repository}`;
  return `https://${owner}.github.io/${repository}`;
}

const siteUrl = deploymentUrl().replace(/\/$/, "");

export const metadata: Metadata = {
  title: "百度之星选手雷达｜初赛第一场 #547",
  description: "整理 2026 年百度之星初赛第一场公开排名、学校与地区信息。",
  openGraph: {
    title: "百度之星选手雷达｜初赛第一场 #547",
    description: "4,000+ 位参赛者的公开总榜、学校与地区资料索引。",
    images: [{ url: `${siteUrl}/og.png`, width: 1673, height: 941, alt: "百度之星选手雷达" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "百度之星选手雷达｜初赛第一场 #547",
    description: "4,000+ 位参赛者的公开总榜、学校与地区资料索引。",
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
