"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-6 text-center"><h1 className="text-xl">تعذّر تحميل الصفحة</h1><p className="text-sm leading-7">حدث خطأ مؤقت. يرجى إعادة المحاولة.</p><button onClick={reset} className="min-h-12 border border-accent px-6 text-sm">إعادة المحاولة</button><Link href="/" className="p-3 text-sm underline">العودة إلى بوابة الدخول</Link></main>;
}
