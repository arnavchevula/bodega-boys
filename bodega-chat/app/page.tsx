import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center font-sans dark:bg-black">
      <main className="container mx-auto flex flex-col flex-1 items-center justify-center gap-y-2">
        <h3 className="italic text-base sm:text-md font-semibold">
          the brand is strong.
        </h3>
        <h1 className="text-7xl font-bold tracking-wide lowercase text-orange-400 bg-sky-700 p-2">
          Bodega Hub
        </h1>
        <h2 className="text-sky-500 font-semibold text-lg bg-white px-1">
          the definitive source for all things in the bodga universe
        </h2>
        <Link
          href="/episodes"
          className="bg-sky-500 text-white border border-slate-100 px-4 rounded-xl shadow-lg hover:shadow-xl uppercase tracking-wide transition active:scale-105"
        >
          Enter
        </Link>
      </main>
    </div>
  );
}
