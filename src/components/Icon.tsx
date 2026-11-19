const paths: Record<string, string> = {
  truck: "M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  inbox: "M4 4h16v16H4zM4 13h4l2 3h4l2-3h4",
  alert: "M12 3 2 20h20L12 3zM12 10v4M12 17h.01",
  euro: "M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  plus: "M12 5v14M5 12h14",
  menu: "M4 6h16M4 12h16M4 18h16",
  file: "M14 3H6v18h12V7zM14 3v4h4",
  book: "M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z",
  leaf: "M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6 6 18",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  logout: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  print: "M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z",
  sparkle: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z",
  scale: "M12 4v16M7 20h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z",
  thermo: "M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z",
  cloudOff: "M3 3l18 18M8 8a5 5 0 0 0-1 0 4 4 0 0 0 0 8h10M19 16a3.5 3.5 0 0 0-2.4-6A6 6 0 0 0 11 6",
};

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[name] ?? ""} />
    </svg>
  );
}
