"""Mock verification provider: a served page that fakes an ID scan + selfie and
posts its own webhook after 3 seconds. No real KYC vendor (AGENTS.md §0.6)."""
import secrets

from .provider import VerificationSession


class MockProvider:
    def start(self, user_id: str) -> VerificationSession:
        session_id = f"vs_{secrets.token_hex(8)}"
        return VerificationSession(session_id=session_id, url=f"/verify/mock/{session_id}")

    def parse_webhook(self, payload: dict) -> tuple[str, bool]:
        return payload["session_id"], payload.get("status") == "verified"


MOCK_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verify identity</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #0b0b10; color: #f2f2f5; font: 15px/1.4 -apple-system, system-ui, sans-serif; }
  .card { width: min(340px, 100% - 32px); padding: 24px; border-radius: 20px; background: #16161f; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0; color: #9a9aab; }
  .frame { position: relative; margin: 20px auto; width: 220px; height: 140px; border: 2px dashed #3a3a4d;
           border-radius: 14px; overflow: hidden; transition: border-radius .4s, height .4s, width .4s; }
  .frame.selfie { width: 150px; height: 150px; border-radius: 50%; }
  .scan { position: absolute; left: 0; right: 0; height: 3px; background: #8b5cf6; box-shadow: 0 0 12px #8b5cf6;
          animation: scan 1.2s ease-in-out infinite alternate; }
  @keyframes scan { from { top: 4%; } to { top: 94%; } }
  ol { list-style: none; padding: 0; margin: 0; text-align: left; }
  li { padding: 6px 0; color: #6b6b7d; }
  li.active { color: #f2f2f5; }
  li.done { color: #34d399; }
  li.done::before { content: "✓ "; }
  .ok { font-size: 44px; color: #34d399; }
  .note { margin-top: 16px; font-size: 12px; }
</style>
</head>
<body>
<div class="card">
  <h1>Verify you're you</h1>
  <p>Verified fans can see who's going.</p>
  <div id="frame" class="frame"><div class="scan"></div></div>
  <ol>
    <li id="s1" class="active">Scanning ID</li>
    <li id="s2">Matching selfie</li>
    <li id="s3">Confirming</li>
  </ol>
  <p class="note">Demo only: no images are captured or stored.</p>
</div>
<script>
  const SESSION_ID = __SESSION_ID__;
  const RETURN_TO = __RETURN_TO__;
  const $ = (id) => document.getElementById(id);
  const step = (done, next) => { $(done).className = "done"; if (next) $(next).className = "active"; };
  setTimeout(() => { step("s1", "s2"); $("frame").classList.add("selfie"); }, 1000);
  setTimeout(() => step("s2", "s3"), 2000);
  setTimeout(async () => {
    await fetch(location.origin + "/verify/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: SESSION_ID, status: "verified" }),
    }).catch(() => {});
    step("s3");
    $("frame").outerHTML = '<div class="ok">✓</div>';
    if (window.parent !== window) window.parent.postMessage({ type: "encore:verified", session_id: SESSION_ID }, "*");
    if (RETURN_TO) setTimeout(() => { location.href = RETURN_TO; }, 600);
  }, 3000);
</script>
</body>
</html>
"""
