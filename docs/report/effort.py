"""Active working time from Claude Code session transcripts.

usage: python3 effort.py <transcript-dir> [--until ISO-UTC]

Every event in every transcript (human message, agent message, tool call, tool result)
has a timestamp. Events from all sessions are merged (parallel sessions count once),
and a gap longer than the idle cutoff ends a working block. Active time is the sum of
the blocks. The transcripts themselves are not in this repository: they contain the
full conversation, local paths and personal details.
"""
import datetime as dt
import glob
import json
import sys


def events(folder, until=None):
    out = []
    for path in glob.glob(f"{folder}/*.jsonl"):
        for line in open(path, encoding="utf-8"):
            try:
                stamp = json.loads(line).get("timestamp")
            except json.JSONDecodeError:
                continue
            if stamp:
                t = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                if until is None or t <= until:
                    out.append(t)
    return sorted(out)


def active(stamps, cutoff_min):
    total, start, prev = dt.timedelta(), stamps[0], stamps[0]
    for t in stamps[1:]:
        if (t - prev).total_seconds() > cutoff_min * 60:
            total += prev - start
            start = t
        prev = t
    return total + (prev - start)


if __name__ == "__main__":
    folder = sys.argv[1]
    until = None
    if "--until" in sys.argv:
        until = dt.datetime.fromisoformat(sys.argv[sys.argv.index("--until") + 1])
    stamps = events(folder, until)
    print(f"events {len(stamps)}, span {stamps[0]:%Y-%m-%d %H:%M} – {stamps[-1]:%Y-%m-%d %H:%M} UTC")
    for cutoff in (5, 10, 15, 30):
        hours, rest = divmod(int(active(stamps, cutoff).total_seconds()), 3600)
        print(f"idle cutoff {cutoff:2d} min: {hours} h {rest // 60:02d} min")
