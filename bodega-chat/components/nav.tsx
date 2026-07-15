"use client";

import Link from "next/link";
import { Menu, Podcast, Clapperboard, Drama, User, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between sticky top-0 z-49 py-2 backdrop-blur-lg border-b border-slate-200 text-sm">
      <div className="px-2">
        <Link href="/">Bodega Chat</Link>
      </div>
      <div className="hidden gap-x-1 sm:flex">
        <div
          className={`flex items-center gap-x-2 hover:bg-slate-800 rounded-md px-2 py-1 ${pathname.includes("search") ? "bg-slate-800 text-sky-400" : ""}`}
        >
          <Search />
          <Link href="/search">Search</Link>
        </div>
        <div
          className={`flex items-center gap-x-2 hover:bg-slate-800 rounded-md px-2 py-1 ${pathname.includes("episodes") ? "bg-slate-800 text-sky-400" : ""}`}
        >
          <Podcast />
          <Link href="/episodes">Episodes</Link>
        </div>
        <div
          className={`flex items-center gap-x-2 hover:bg-slate-800 rounded-md px-2 py-1 ${pathname.includes("characters") ? "bg-slate-800 text-sky-400" : ""}`}
        >
          {" "}
          <Clapperboard />
          <Link href="/characters">Characters</Link>
        </div>
        <div
          className={`flex items-center gap-x-2 hover:bg-slate-800 rounded-md px-2 py-1 ${pathname.includes("skits") ? "bg-slate-800 text-sky-400" : ""}`}
        >
          {" "}
          <Drama />
          <Link href="/skits">Skits</Link>
        </div>
      </div>
      <div className="flex gap-x-2 items-center">
        <div className="flex items-center gap-x-1">
          <User />
          <p>Login</p>
        </div>
        <div className="flex items-center sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader />
              <div className="flex flex-col items-start gap-y-2 px-2">
                <span
                  className={`flex items-center gap-2 p-2 active:bg-slate-800 w-full rounded-md font-semibold ${pathname.includes("/episodes") ? "bg-slate-800 text-sky-400" : ""}`}
                >
                  <Podcast />
                  <Link href="/episodes" className="text-sm">
                    Episodes
                  </Link>
                </span>
                <span
                  className={`flex items-center gap-2 p-2 active:bg-slate-800 w-full rounded-md font-semibold ${pathname.includes("/skits") ? "bg-slate-800" : ""}`}
                >
                  <Clapperboard />
                  <Link href="/skits" className="text-sm">
                    Skits
                  </Link>
                </span>
                <span
                  className={`flex items-center gap-2 p-2 active:bg-slate-800 w-full rounded-md font-semibold ${pathname.includes("/characters") ? "bg-slate-800" : ""}`}
                >
                  <Drama />
                  <Link href="/characters" className="text-sm">
                    Characters
                  </Link>
                </span>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
