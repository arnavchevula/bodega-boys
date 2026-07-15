"use client";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

export default function ProgressBar({}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 10;
      });
    }, 100);

    return () => clearInterval(timer);
  }, []);

  return (
    <Progress
      value={progress}
      className="w-full h-4 [&_[data-slot=progress-indicator]]:bg-white"
    />
  );
}
