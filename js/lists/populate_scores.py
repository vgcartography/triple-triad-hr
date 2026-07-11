import csv
import random
from pathlib import Path

RANK_TOTALS = {
    "1": (10, 13),
    "2": (12, 15),
    "3": (16, 18),
    "4": (17, 20),
    "5": (16, 22),
    "6": (20, 23),
    "7": (23, 25),
    "8": (23, 26),
    "9": (24, 27),
    "10": (26, 29),
    "A": (26, 29),
}


def rank_key(rank):
    """Normalize rank values."""
    rank = str(rank).strip().upper()
    if rank == "A":
        return "A"
    return str(int(rank))


def has_scores(row):
    try:
        return all(row.get(col, "").strip() for col in
               ("Top", "Right", "Bottom", "Left"))
    except Exception as e:
        return False


def score_tuple(row):
    return (
        int(row["Top"]),
        int(row["Right"]),
        int(row["Bottom"]),
        int(row["Left"]),
    )


def random_candidate(min_total, max_total):
    """Generate a reasonably random TT card."""
    target = random.randint(min_total, max_total)

    while True:
        vals = [1, 1, 1, 1]
        remaining = target - 4

        # Randomly distribute remaining points
        while remaining > 0:
            i = random.randrange(4)
            if vals[i] < 10:
                vals[i] += 1
                remaining -= 1

        # Shuffle so larger values aren't clustered
        random.shuffle(vals)

        # Prefer interesting cards
        if max(vals) - min(vals) >= 2:
            return tuple(vals)


def generate_unique(rank, used):
    lo, hi = RANK_TOTALS[rank_key(rank)]

    for _ in range(50000):
        candidate = random_candidate(lo, hi)
        if candidate not in used:
            return candidate

    raise RuntimeError(
        f"Unable to find unique card for rank {rank}. "
        "You may have exhausted the available combinations."
    )


def process(directory):
    directory = Path(directory)

    csv_files = sorted(directory.glob("*.csv"))

    used_scores = set()

    # First pass: collect existing scores
    for file in csv_files:
        with open(file, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            for row in reader:
                if has_scores(row):
                    used_scores.add(score_tuple(row))

    print(f"Loaded {len(used_scores)} existing score combinations.")

    # Second pass: fill blanks
    for file in csv_files:
        changed = False

        with open(file, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            fields = reader.fieldnames

        for row in rows:
            if has_scores(row) or row["Rank"] is None or len(row["Rank"]) == 0:
                continue

            scores = generate_unique(row["Rank"], used_scores)

            row["Top"] = scores[0]
            row["Right"] = scores[1]
            row["Bottom"] = scores[2]
            row["Left"] = scores[3]

            used_scores.add(scores)
            changed = True

            print(
                f"{row['Card Name']:<25}"
                f"{scores}  total={sum(scores)}"
            )

        if changed:
            with open(file, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)

            print(f"Updated {file.name}")


process(r"C:\Git\triple-triad-hr\js\lists")
