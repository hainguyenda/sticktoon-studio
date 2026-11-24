"use client";

import dynamic from "next/dynamic";

const Studio = dynamic(() => import("@/components/Studio"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center text-sm text-gray-400">Đang khởi động StickToon Studio…</div>
  ),
});

export default function Page() {
  return <Studio />;
}
