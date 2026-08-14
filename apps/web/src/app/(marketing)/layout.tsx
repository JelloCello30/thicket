import Link from "next/link";
import { BRAND } from "@tabmind/config";
import { Lockup, Mark } from "@tabmind/ui";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-edge bg-overlay backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <Link href="/" aria-label="TabMind home">
            <Lockup size={22} />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <HeaderLink href="/pricing">Pricing</HeaderLink>
            <HeaderLink href="/download">Download</HeaderLink>
            <HeaderLink href="/login" className="hidden sm:inline-block">
              Sign in
            </HeaderLink>
            <Link
              href="/download"
              className="ml-1 whitespace-nowrap rounded-md bg-accent px-3 py-1.5 text-[0.8125rem] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Add to Chrome
            </Link>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-edge">
        <div className="mx-auto w-full max-w-5xl px-6 py-12">
          <div className="flex flex-col justify-between gap-8 sm:flex-row">
            <div className="max-w-xs">
              <Mark size={22} />
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-secondary">
                Your tabs, organized by what you're actually doing.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-[0.8125rem]">
              <div className="flex flex-col gap-2">
                <FooterLink href="/pricing">Pricing</FooterLink>
                <FooterLink href="/download">Download</FooterLink>
                <FooterLink href="/login">Sign in</FooterLink>
              </div>
              <div className="flex flex-col gap-2">
                <FooterLink href="/privacy">Privacy</FooterLink>
                <FooterLink href="/terms">Terms</FooterLink>
                <a href={`mailto:${BRAND.supportEmail}`} className="text-ink-secondary hover:text-ink">
                  Support
                </a>
              </div>
            </div>
          </div>
          <p className="mt-10 text-[0.75rem] text-ink-faint">
            © {new Date().getFullYear()} TabMind. Your tabs stay on your device unless you say otherwise.
          </p>
        </div>
      </footer>
    </div>
  );
}

function HeaderLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1.5 text-[0.8125rem] text-ink-secondary transition-colors hover:text-ink ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-ink-secondary hover:text-ink">
      {children}
    </Link>
  );
}
