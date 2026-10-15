"use client";

import { useEffect, useRef } from "react";
import { createLockerTools } from "../public/locker-tools.js";

type Family = { name: string; variants: string[] };
type Catalog = { seasonId: string; chapter: string; season: string; families: Family[] };
type Props = {
  season: Catalog;
  catalogs: Catalog[];
  families: Family[];
  progress: Record<string, { acquired: boolean; mastered: boolean }>;
  imageFor: (name: string, variant: string) => string;
  onToggle: (name: string, variant: string, field: "acquired" | "mastered") => void;
  onSeason: (id: string) => void;
};

export default function LockerTools(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const tools = useRef<ReturnType<typeof createLockerTools> | null>(null);
  useEffect(() => {
    if (host.current) tools.current = createLockerTools(host.current);
    return () => { tools.current?.dispose(); tools.current = null; };
  }, []);
  useEffect(() => { tools.current?.update(props); }, [props]);
  return <div ref={host} />;
}
