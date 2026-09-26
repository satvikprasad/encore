"use client";

import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { ErrorNote, Page, Spinner, TopBar } from "@/components/ui";
import { API_URL, api, usesFixture } from "@/lib/api";
import { markJustVerified, setFixtureVerified } from "@/lib/session";
import { useUser } from "@/lib/user";

function safeReturnTo(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const { userId } = useUser();
  const router = useRouter();
  const returnTo = safeReturnTo(useSearchParams().get("returnTo"));
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const done = useRef(false);
  const fixtureMode = usesFixture("verifyStart");

  function finish() {
    if (done.current) return;
    done.current = true;
    if (fixtureMode) setFixtureVerified(userId);
    markJustVerified();
    setTimeout(() => router.replace(returnTo), 400);
  }

  // Start exactly one session per visit (StrictMode runs effects twice in dev, and a
  // second session would overwrite the first one's verification_ref).
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (started.current === userId) return;
    started.current = userId;
    api.verifyStart(userId).then((s) => {
      const url = new URL(s.url, API_URL);
      url.searchParams.set("returnTo", `${window.location.origin}${returnTo}`);
      setSrc(url.toString());
    }, setError);
  }, [userId, returnTo]);

  // The mock page posts {type:"encore:verified"} to its parent after its webhook call.
  useEffect(() => {
    if (fixtureMode) return;
    const apiOrigin = new URL(API_URL).origin;
    function onMessage(e: MessageEvent) {
      if (e.origin === apiOrigin && e.data?.type === "encore:verified") finish();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureMode]);

  return (
    <>
      <TopBar title="Verify your ID" back={returnTo} />
      {error ? (
        <Page>
          <ErrorNote error={error} />
        </Page>
      ) : !src ? (
        <Spinner label="Starting secure session" />
      ) : fixtureMode ? (
        <FixtureMock onDone={finish} />
      ) : (
        <iframe title="Identity verification" src={src} className="block h-[760px] w-full border-0 bg-ink" />
      )}
    </>
  );
}

/** Same flow as the API's mock page, for fixture mode when no API is running. */
function FixtureMock({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const t = [1000, 2000, 3000].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    const end = setTimeout(() => onDoneRef.current(), 3600);
    return () => {
      t.forEach(clearTimeout);
      clearTimeout(end);
    };
  }, []);
  const steps = ["Scanning ID", "Matching selfie", "Confirming"];
  return (
    <Page className="flex flex-col items-center pt-10 text-center">
      <h2 className="text-lg font-semibold">Verify you&apos;re you</h2>
      <p className="text-sm text-muted">Verified fans can see who&apos;s going.</p>
      {step < 3 ? (
        <div
          className={clsx(
            "relative mx-auto my-6 overflow-hidden border-2 border-dashed border-line transition-all duration-500",
            step >= 1 ? "h-[150px] w-[150px] rounded-full" : "h-[140px] w-[220px] rounded-2xl",
          )}
        >
          <div className="absolute inset-x-0 h-[3px] animate-[scan_1.2s_ease-in-out_infinite_alternate] bg-accent shadow-[0_0_12px_#8b5cf6]" />
        </div>
      ) : (
        <div className="animate-pop my-6 text-5xl text-good">✓</div>
      )}
      <ol className="w-full max-w-[240px] space-y-2 text-left text-sm">
        {steps.map((s, i) => (
          <li key={s} className={clsx(i < step ? "text-good" : i === step ? "text-white" : "text-dim")}>
            {i < step ? "✓ " : ""}
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-dim">Demo only: no images are captured or stored.</p>
      <style>{`@keyframes scan { from { top: 4%; } to { top: 94%; } }`}</style>
    </Page>
  );
}
