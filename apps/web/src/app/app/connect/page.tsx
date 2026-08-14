import { requireSessionUser } from "@/lib/request-auth";
import { ConnectFlow } from "./connect-flow";

export const metadata = { title: "Connect extension" };

export default async function ConnectPage() {
  await requireSessionUser();
  const extensionIds = (process.env.TABMIND_EXTENSION_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Connect the extension</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
        Linking gives the TabMind extension a private key for this account — it's how workspaces sync
        and AI features unlock. You can disconnect any device from Settings at any time.
      </p>
      <ConnectFlow extensionIds={extensionIds} />
    </div>
  );
}
