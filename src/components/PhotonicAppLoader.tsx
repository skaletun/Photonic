"use client";

import dynamic from "next/dynamic";

const PhotonicApp = dynamic(() => import("./PhotonicApp").then((mod) => mod.PhotonicApp), {
  ssr: false,
});

export function PhotonicAppLoader() {
  return <PhotonicApp />;
}
