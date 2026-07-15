import Link from "next/link";

export function Footer() {
  return (
    <div className="flex flex-col-reverse sm:flex-row border-t  border-slate-300 mx-auto container justify-between items-center text-sm backdrop-blur-sm">
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
            style={{ height: "60px !important", width: "217px !important" }}
          />
        </a>
      </div>
    </div>
  );
}
