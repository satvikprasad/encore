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
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding-top: 24px;
         background: #F6F4EF; color: #1A1722; font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif; }
  .card { width: min(358px, 100% - 32px); padding: 28px 24px; border-radius: 28px; background: #fff; text-align: center;
          border: 1px solid #E8E4DC; box-shadow: 0 1px 2px rgba(26,23,34,.04), 0 4px 16px -6px rgba(26,23,34,.08); }
  .badge { display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: #EEEBFF; color: #5B45F5; margin-bottom: 10px; }
  h1 { font: 400 30px/1 Georgia, "Times New Roman", serif; letter-spacing: -.01em; margin: 0 0 6px; }
  p { margin: 0; color: #6B6675; font-size: 14px; }
  .frame { position: relative; margin: 24px auto; width: 220px; height: 140px; border: 2px dashed rgba(91,69,245,.4); background: #F1EEE8;
           border-radius: 16px; overflow: hidden; transition: border-radius .4s, height .4s, width .4s; }
  .frame.selfie { width: 150px; height: 150px; border-radius: 50%; }
  .scan { position: absolute; left: 0; right: 0; height: 3px; background: #5B45F5; box-shadow: 0 0 14px #5B45F5;
          animation: scan 1.2s ease-in-out infinite alternate; }
  @keyframes scan { from { top: 4%; } to { top: 94%; } }
  ol { list-style: none; padding: 0; margin: 0 auto; width: 200px; text-align: left; }
  li { padding: 6px 0; color: #A29DAA; font-size: 14px; display: flex; align-items: center; gap: 8px; }
  li::before { content: ""; width: 18px; height: 18px; border-radius: 50%; border: 1px solid #E8E4DC; flex: none; }
  li.active { color: #1A1722; font-weight: 600; }
  li.active::before { border-color: #5B45F5; }
  li.done { color: #1F9D5B; }
  li.done::before { content: "✓"; display: grid; place-items: center; border-color: #1F9D5B; background: #1F9D5B; color: #fff; font-size: 11px; }
  .ok { display: grid; place-items: center; width: 150px; height: 150px; margin: 24px auto; border-radius: 50%; background: #E6F6EC; color: #1F9D5B; font-size: 56px; }
  .note { margin-top: 18px; font-size: 12px; color: #A29DAA; }
</style>
</head>
<body>
<div class="card">
  <div class="badge"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 5 6v5.5c0 4.3 3 7.8 7 9 4-1.2 7-4.7 7-9V6z"/><path d="M9 12l2 2 4-4"/></svg></div>
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
