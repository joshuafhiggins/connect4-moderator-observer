"use client";

import { useEffect } from "react";
import { useConnection } from "@/lib/connection";

const DEFAULT_TITLE = "Connect4 RPI Minds & Machines";

export default function PageTitleManager() {
  const { role, username } = useConnection();

  useEffect(() => {
    if (role === "player" && username.trim()) {
      document.title = `${username.trim()} - ${DEFAULT_TITLE}`;
      return;
    }

    document.title = DEFAULT_TITLE;
  }, [role, username]);

  return null;
}
