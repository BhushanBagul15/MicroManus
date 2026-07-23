import { LoginButtons } from "@/components/LoginButtons";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-accent">
            <span className="h-2 w-2 rounded-full bg-accent" />
            MicroManus
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            A research agent that shows its work.
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Bring your own OpenAI, Anthropic, or Kimi key. Watch it search, read sources, and
            write a downloadable report — with exact token cost tracked per thread.
          </p>
        </div>

        <LoginButtons />

        <p className="text-xs text-muted-foreground">
          Sign in to continue. New accounts unlock via a coupon code or a one-time $5 payment.
        </p>
      </div>
    </main>
  );
}
