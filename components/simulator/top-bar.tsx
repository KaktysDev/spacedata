"use client";

import { useEffect, useState } from "react";

export function TopBar() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const format = () =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC",
      }).format(new Date());

    const update = () => setTime(format());
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white px-4 sm:px-6 md:px-8">
      <h1 className="text-[15px] font-medium tracking-tight">
        Starcloud Simulator
      </h1>
      <p className="font-mono text-[11px] tracking-[0.14em] text-white/70 tabular-nums">
        {time ? `${time} UTC` : "UTC"}
      </p>
    </header>
  );
}
