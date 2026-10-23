import { Icon } from "./Icon";

export const REPO = "https://github.com/manicpsycho01/recon";

export function Logo() {
  return (
    <span className="display inline-flex items-center gap-2 text-[1.6rem] leading-none italic">
      <svg viewBox="0 0 28 20" className="h-4.5 w-6.5" aria-hidden>
        <rect x="1" y="2" width="8" height="4" rx="2" className="fill-ink" />
        <rect x="1" y="14" width="8" height="4" rx="2" className="fill-ink" />
        <rect x="19" y="8" width="8" height="4" rx="2" className="fill-ink" />
        <path d="M9 4c5 0 5 6 10 6M9 16c5 0 5-6 10-6" fill="none" strokeWidth="1.6" className="stroke-thread" />
      </svg>
      Recon
    </span>
  );
}

export function SiteHeader({ onHome }: { onHome?: () => void }) {
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="wrap flex min-h-16 items-center justify-between gap-4 py-2">
        {onHome ? (
          <button type="button" onClick={onHome} className="flex min-h-11 items-center" aria-label="Recon — start over">
            <Logo />
          </button>
        ) : (
          <a href="/" className="flex min-h-11 items-center" aria-label="Recon home">
            <Logo />
          </a>
        )}
        <p className="label inline-flex min-h-9 items-center gap-2 rounded-[3px] border border-line px-3 text-muted">
          <Icon name="lock" className="size-3.5 shrink-0" />
          <span className="sm:hidden">Never uploaded</span>
          <span className="hidden sm:inline">Your files never leave this device</span>
        </p>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="wrap flex flex-col gap-2 py-8 text-[13px] text-muted md:flex-row md:justify-between">
        <p>Not accounting advice. Always confirm matches against your books.</p>
        <p className="flex flex-wrap gap-x-5 gap-y-1">
          <a href={REPO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-ink">
            <Icon name="github" className="size-3.5" /> Source code on GitHub
          </a>
          <span>
            Built by <a href="https://aravind-portfolio-theta.vercel.app" className="underline underline-offset-4 hover:text-ink">Aravind Srinivasan</a>
          </span>
        </p>
      </div>
    </footer>
  );
}
