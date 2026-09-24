import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { LoginForm } from "@/components/auth/LoginForm";
import { RewindLogo } from "@/components/icons/RewindLogo";
import { getAccessToken } from "@/lib/access";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  // The token is read at request time; a build without it must not bake
  // in the redirect below.
  await connection();

  // Nothing to sign in to when access control is off.
  if (!getAccessToken()) {
    redirect("/");
  }

  const { next } = await searchParams;

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6">
        <RewindLogo />

        <h1 className="mt-6 text-lg font-semibold text-ink">Sign in to Rewind</h1>

        <p className="mt-1 mb-6 text-sm text-muted">
          This Rewind is protected. Enter the value of{" "}
          <code className="font-mono text-ink-2">REWIND_ACCESS_TOKEN</code>.
        </p>

        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </div>
  );
}
