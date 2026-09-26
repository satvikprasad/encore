"use client";

import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { IconCheck, IconShield } from "@/components/icons";
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
        <iframe title="Identity verification" src={src} className="block h-[740px] w-full border-0 bg-canvas" />
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
    <Page className="flex flex-col items-center pt-6 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent">
        <IconShield size={22} />
      </span>
      <h2 className="display text-[30px] leading-none">Verify you&apos;re you</h2>
      <p className="-mt-2 text-sm text-muted">Verified fans can see who&apos;s going.</p>

      <div className="card flex w-full flex-col items-center py-8">
        {step < 3 ? (
          <div
            className={clsx(
              "relative overflow-hidden border-2 border-dashed border-accent/40 bg-sunken transition-all duration-500",
              step >= 1 ? "h-[150px] w-[150px] rounded-full" : "h-[140px] w-[220px] rounded-2xl",
            )}
          >
            <div className="absolute inset-x-0 h-[3px] animate-[scan_1.2s_ease-in-out_infinite_alternate] bg-accent shadow-[0_0_14px_#5B45F5]" />
          </div>
        ) : (
          <div className="animate-pop grid h-[150px] w-[150px] place-items-center rounded-full bg-good-soft text-good">
            <IconCheck size={56} strokeWidth={2.4} />
          </div>
        )}
        <ol className="mt-6 w-full max-w-[220px] space-y-2 text-left text-sm">
          {steps.map((s, i) => (
            <li key={s} className={clsx("flex items-center gap-2 transition-colors", i < step ? "text-good" : i === step ? "font-semibold text-fg" : "text-dim")}>
              <span
                className={clsx(
                  "grid h-5 w-5 place-items-center rounded-full border text-[10px]",
                  i < step ? "border-good bg-good text-white" : i === step ? "border-accent text-accent" : "border-line",
                )}
              >
                {i < step ? <IconCheck size={11} strokeWidth={3} /> : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>
      <p className="text-xs text-dim">Demo only: no images are captured or stored.</p>
      <style>{`@keyframes scan { from { top: 4%; } to { top: 94%; } }`}</style>
    </Page>
  );
}
