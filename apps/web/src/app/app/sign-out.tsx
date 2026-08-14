"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={() =>
        void authClient.signOut().then(() => {
          router.push("/");
          router.refresh();
        })
      }
      className="rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] text-ink-faint hover:bg-sunken hover:text-ink"
    >
      Sign out
    </button>
  );
}
