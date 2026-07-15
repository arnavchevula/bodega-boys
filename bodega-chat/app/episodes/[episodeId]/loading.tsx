import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid grid-cols-2 flex-1 min-h-screen">
      <div className="h-full w-full">
        <Skeleton className="h-32 w-[90%]" />
      </div>
      {/* Utterance rows */}
      <div className=" h-full w-full px-2 flex flex-col gap-y-2">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="flex gap-3 flex-col">
            <Skeleton className="h-4 w-32" /> {/* speaker label */}
            <Skeleton className="h-8 w-full" /> {/* utterance text */}
          </div>
        ))}
      </div>
    </div>
  );
}
