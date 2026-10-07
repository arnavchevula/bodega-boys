import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-slate-300 backdrop-blur-sm bg-linear-to-r from-blue-500/80 to-blue-800/80 text-white">
    <div className="flex flex-col-reverse sm:flex-row mx-auto container justify-between items-center text-sm">
      <div>Copyright @ 2026</div>
      <div className="flex gap-2 items-center">
        <Link
          href="/search"
          className="hover:underline duration-300 transition animate"
        >
          Search
        </Link>
        <Link
          href="/contact"
          className="hover:underline duration-300 transition animate"
        >
          Contact
        </Link>
        <Link
          href="/legal"
          className="hover:underline duration-300 transition animate"
        >
          Legal
        </Link>
      </div>
      <div className="py-2">
        <a href="https://www.buymeacoffee.com/navviec" target="_blank">
          <img
            src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png"
            alt="Buy Me a Coffee"
            className="h-[60px] w-[217px]"
          />
        </a>
      </div>
    </div>
    </footer>
  );
}
