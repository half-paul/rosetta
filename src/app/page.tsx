import Link from "next/link";
import { Search, BookOpen, Shield, Users, ArrowRight, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const popularPages = [
  {
    title: "Submit an Article",
    description: "Paste a Wikipedia URL to start a fact-check",
    href: "/dashboard",
    icon: BookOpen,
  },
  {
    title: "How Scoring Works",
    description: "Our 0–100 factual scoring methodology",
    href: "/about/scoring",
    icon: Sparkles,
  },
  {
    title: "Recent Fact-Checks",
    description: "Browse published reviews from our community",
    href: "/reviews",
    icon: Shield,
  },
  {
    title: "Reviewer Guidelines",
    description: "Standards and process for human reviewers",
    href: "/about/guidelines",
    icon: Users,
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <nav className="h-14 border-b px-6 flex items-center justify-between">
        <span className="text-base font-semibold">Rosetta</span>
        <Link href="/login">
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 pt-24 pb-16 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Fact-check Wikipedia,
            <br />
            <span className="text-muted-foreground">powered by AI + humans</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground">
            Rosetta combines AI analysis with human review to score Wikipedia
            articles for factual accuracy. Every published review is verified by
            a person.
          </p>

          {/* Search */}
          <form
            action="/search"
            className="mx-auto mt-10 flex max-w-xl items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                placeholder="Search articles, reviews, or paste a Wikipedia URL…"
                className="h-11 pl-9 text-base"
              />
            </div>
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>
        </section>

        {/* Popular pages */}
        <section className="mx-auto max-w-3xl px-6 pb-24">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Popular pages
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {popularPages.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="group flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50"
              >
                <page.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    {page.title}
                    <ArrowRight className="size-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {page.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Rosetta &middot; AI-accelerated Wikipedia fact-checking
      </footer>
    </div>
  );
}
