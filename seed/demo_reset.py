"""Put Sam back to the start of the demo (AGENTS.md §7.5). Entry: python -m seed.demo_reset

Removes the demo user's d01–d06 attendances/reviews, all of their comparisons, crews and uploads,
un-verifies Sam, and resets Sam's weights and review variances.
"""
import json
import shutil
import sqlite3

from .seed import DB, DEMO_SHOWS

from app.constants import RANKER, UNIFORM_WEIGHTS  # noqa: E402


def main():
    conn = sqlite3.connect(DB)
    marks = ",".join("?" * len(DEMO_SHOWS))
    conn.execute(f"DELETE FROM reviews WHERE user_id = 'sam' AND event_id IN ({marks})", DEMO_SHOWS)
    conn.execute(f"DELETE FROM attendance WHERE user_id = 'sam' AND event_id IN ({marks})", DEMO_SHOWS)
    conn.execute("DELETE FROM media WHERE user_id = 'sam'")
    shutil.rmtree(DB.parent / "media" / "sam", ignore_errors=True)  # Sam's uploaded photos and videos
    conn.execute("DELETE FROM comparisons WHERE user_id = 'sam'")
    conn.execute("UPDATE reviews SET theta_var = ? WHERE user_id = 'sam'", (RANKER["prior_var"],))
    conn.execute("UPDATE users SET verified = 0, verified_at = NULL, verification_ref = NULL, weights = ?"
                 " WHERE id = 'sam'", (json.dumps(UNIFORM_WEIGHTS),))
    crews = [r[0] for r in conn.execute("SELECT id, member_ids FROM crews") if "sam" in json.loads(r[1])]
    conn.executemany("DELETE FROM crews WHERE id = ?", [(c,) for c in crews])
    conn.commit()
    conn.close()
    print(f"demo reset: demo user unverified, d01–d06 removed, {len(crews)} crew(s) deleted")


if __name__ == "__main__":
    main()
