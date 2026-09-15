import type { ReactNode } from "react";

export function generateStaticParams() {
  return [{ id: "__id__" }];
}

export default function PlaylistEditorLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
