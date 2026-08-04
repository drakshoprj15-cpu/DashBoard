"use client";

import { useEffect } from "react";

/** Remove o fragmento legado que o navegador pode preservar após um 308. */
export function LegacyPushcutHashCleanup() {
  useEffect(() => {
    if (!window.location.hash) return;

    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}`,
    );
  }, []);

  return null;
}
