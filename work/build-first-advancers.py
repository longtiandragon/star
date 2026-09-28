"""Extract the official first-round advancement list without copying real names."""

import argparse
import hashlib
import json
from pathlib import Path

import pdfplumber


parser = argparse.ArgumentParser()
parser.add_argument("pdf", type=Path)
args = parser.parse_args()

root = Path(__file__).resolve().parent.parent
ranking = json.loads((root / "app/data/contest-547-ranking.json").read_text(encoding="utf-8"))
by_nickname = {}
for contestant in ranking["contestants"] + ranking["excludedContestants"]:
    by_nickname.setdefault(contestant["nickname"], []).append(contestant["userId"])

names_by_rank = {}
with pdfplumber.open(args.pdf) as pdf:
    for page in pdf.pages:
        for line in (page.extract_text() or "").splitlines():
            fields = line.split()
            if len(fields) >= 3 and fields[0].isdigit() and 1 <= int(fields[0]) <= 400:
                names_by_rank[int(fields[0])] = fields[1]
        for table in page.extract_tables():
            for row in table:
                if not row or len(row) < 4 or not row[0] or not row[0].strip().isdigit():
                    continue
                official_rank = int(row[0].strip())
                if not 1 <= official_rank <= 400:
                    continue
                names_by_rank[official_rank] = "".join((row[1] or "").split())

rows = []
for official_rank, nickname in sorted(names_by_rank.items()):
    ids = by_nickname.get(nickname, [])
    if len(ids) > 1:
        raise ValueError(f"Ambiguous nickname in first-round ranking: {nickname}")
    rows.append({
        "officialRank": official_rank,
        "nickname": nickname,
        "userId": ids[0] if ids else None,
    })

if [row["officialRank"] for row in rows] != list(range(1, 401)):
    raise ValueError("Official advancement list must contain ranks 1 through 400 exactly once")
if len({row["nickname"] for row in rows}) != 400:
    raise ValueError("Official advancement nicknames must be unique")

document = {
    "source": {
        "articleUrl": "https://astar.baidu.com/#/news-info?tab=3&id=BD77376602C1554CA87580681A558B7C",
        "pdfUrl": "https://base.cdn.bcebos.com/2026_astar_first_jinji.pdf",
        "pdfSha256": hashlib.sha256(args.pdf.read_bytes()).hexdigest(),
    },
    "advancers": rows,
}
output = root / "work/contest-547-advancers.json"
output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
unresolved = [row for row in rows if row["userId"] is None]
print(f"Official first-round advancers: {len(rows)}; ID matched: {len(rows) - len(unresolved)}")
print(f"Unresolved nicknames: {[row['nickname'] for row in unresolved]}")
print(f"Saved {output}")
