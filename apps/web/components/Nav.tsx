import Link from "next/link";
import Image from "next/image";
import logo from "@/public/RevokeLogo.png";

export function Nav({ children }: { children?: React.ReactNode }) {
  return (
    <header className="anim-in border-b border-border/50 sticky top-0 z-20 bg-bg/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="group flex items-center gap-2.5">
          <Image
            src={logo}
            alt="Revoke"
            width={32}
            height={32}
            priority
            className="rounded-lg transition-transform group-hover:scale-105"
          />
        </Link>
        {children && (
          <nav className="flex items-center gap-6 text-sm">{children}</nav>
        )}
      </div>
    </header>
  );
}
