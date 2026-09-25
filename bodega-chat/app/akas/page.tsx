import { supabase } from "@/lib/db";

export default async function Akas() {
  const db = await supabase();
  const { data: akas, error } = await db.from("akas").select("*");
  const hostCounts = akas?.reduce((acc, aka) => {
    acc[aka.host] = (acc[aka.host] || 0) + 1;
    return acc;
  }, {});
  console.log(hostCounts);
  console.log("akas", akas, error);
  return (
    <div className="flex flex-col flex-1 mx-auto">
      <div className="flex flex-col p-2 sm:p-0">
        <h1 className="text-5xl font-bold mt-2">Akas</h1>
        <h4 className="text-base text-slate-500 mt-2">
          You already know the fucking vibes. All the aliases, all the
          psuedonames for the audio art. Sourced from r/bodegaboys and
          intelligently parsed from the proprietary Bodega Boys database. Enjoy
          you fucking scumbags.
        </h4>
      </div>
      <div className="flex flex-wrap gap-2 mt-4 p-2 sm:p-0">
        {Object.entries(hostCounts).map(([host, count]) => (
          <span key={host} className="flex rounded-xl bg-slate-100 p-2 w-fit">
            <span className="text-lg font-bold flex items-center gap-2">
              <span className="text-sm text-slate-400">{host}</span>
              {count as React.ReactNode}
            </span>
          </span>
        ))}
      </div>

      <div className="sm:flex sm:flex-col sm:items-center sm:justify-center sm:gap-4 mt-4 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-6 xl:grid xl:grid-cols-4 flex flex-col flex-1 gap-4 p-2">
        {akas?.map((aka) => (
          <div
            key={aka.id}
            className="flex flex-col rounded-xl bg-slate-100 p-4 h-full hover:scale-105 transition duration-300"
          >
            <p className="text-lg font-bold">{aka.term}</p>
            <p className="text-sm text-slate-400">{aka.host}</p>
            <p className="text-slate-500 text-base">{aka.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
