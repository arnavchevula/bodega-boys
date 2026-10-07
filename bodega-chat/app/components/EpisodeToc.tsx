"use client";
import { useState, useEffect } from "react";

const sections = [
  { label: "Full Transcript", id: "transcript" },
  { label: "Stories", id: "stories" },
  { label: "Quotes", id: "quotes" },
  { label: "Characters", id: "characters" },
  { label: "Media References", id: "media_references" },
  { label: "News References", id: "news_references" },
];

export default function EpisodeToc() {
  const [active, setActive] = useState(0);

  function handleClick(e, index, section) {
    e.preventDefault();
    document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
    setActive(index);
  }

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // active = the section whose top most recently scrolled past the sticky nav
        let current = 0;
        let closestTop = -Infinity;
        sections.forEach((section, index) => {
          const top = document
            .getElementById(section.id)
            ?.getBoundingClientRect().top;
          if (top !== undefined && top <= 80 && top > closestTop) {
            closestTop = top;
            current = index;
          }
        });
        setActive(current);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return (
    <nav className="sticky top-16">
      <div className="text-slate-400 uppercase tracking-widest font-semibold">
        Contents
      </div>
      <ol>
        {sections.map((section, index) => {
          return (
            <li
              key={section.label}
              className={`${active === index ? "text-slate-600 underline" : "text-slate-700"} hover:text-slate-500`}
              onClick={(e) => handleClick(e, index, section)}
            >
              <a href={`#${section.id}`}>{section.label}</a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
