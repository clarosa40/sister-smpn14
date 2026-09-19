"use client";

import { SidebarNav } from "@/components/sidebar-nav";
import { LABEL_PERAN, navUntukPeran } from "@/config/nav-items";
import type { User } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { LogOut, Menu, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as React from "react";

export function AppShell({
    user,
    children,
}: {
    user: User;
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [drawerTerbuka, setDrawerTerbuka] = React.useState(false);

    // Judul topbar diambil dari nav: butir nav sudah menamai setiap halaman,
    // jadi tidak ada daftar judul kedua yang bisa ikut basi.
    const judul =
        navUntukPeran(user.role).find(
            (item) =>
                pathname === item.href || pathname.startsWith(`${item.href}/`),
        )?.label ?? "SIPB";

    // Klik pada butir nav menutup drawer lewat onNavigate. Yang tersisa di sini
    // adalah dua jalan keluar yang datang dari luar React: tombol Esc dan
    // tombol maju/mundur peramban.
    React.useEffect(() => {
        if (!drawerTerbuka) return;

        const tutup = () => setDrawerTerbuka(false);
        const tutupDenganEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") tutup();
        };

        document.addEventListener("keydown", tutupDenganEsc);
        window.addEventListener("popstate", tutup);

        const overflowAsli = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", tutupDenganEsc);
            window.removeEventListener("popstate", tutup);
            document.body.style.overflow = overflowAsli;
        };
    }, [drawerTerbuka]);

    return (
        <div className="flex min-h-svh bg-background">
            {/* Sidebar layar lebar. Tinggi dikunci setinggi layar dan
                dilekatkan, supaya petak pengguna di kakinya tetap terlihat
                pada halaman panjang - tanpa itu sidebar ikut memanjang
                sepanjang dokumen dan petaknya turun jauh ke bawah. */}
            <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
                <IsiSidebar user={user} />
            </aside>

            {/* Drawer ponsel */}
            <div
                className={cn(
                    "fixed inset-0 z-50 md:hidden",
                    drawerTerbuka ? "visible" : "invisible",
                )}
            >
                <div
                    onClick={() => setDrawerTerbuka(false)}
                    className={cn(
                        "absolute inset-0 bg-foreground/40 transition-opacity duration-200 motion-reduce:transition-none",
                        drawerTerbuka ? "opacity-100" : "opacity-0",
                    )}
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Menu navigasi"
                    className={cn(
                        "absolute inset-y-0 left-0 flex w-70 flex-col bg-sidebar shadow-[4px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-out motion-reduce:transition-none",
                        drawerTerbuka ? "translate-x-0" : "-translate-x-full",
                    )}
                >
                    <IsiSidebar
                        user={user}
                        onTutup={() => setDrawerTerbuka(false)}
                    />
                </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
                    <button
                        type="button"
                        onClick={() => setDrawerTerbuka(true)}
                        aria-label="Buka menu navigasi"
                        aria-expanded={drawerTerbuka}
                        className="-ml-1.5 flex size-9 items-center justify-center rounded-md text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
                    >
                        <Menu className="size-5.5" strokeWidth={1.8} />
                    </button>
                    <h1 className="truncate text-[15px] font-semibold text-foreground">
                        {judul}
                    </h1>
                </header>

                <main className="flex-1 p-4 md:p-6">{children}</main>
            </div>
        </div>
    );
}

function IsiSidebar({ user, onTutup }: { user: User; onTutup?: () => void }) {
    return (
        <>
            <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
                {/* Tingginya disamakan dengan blok teks di sebelahnya, dan
                    lebarnya dibiarkan mengikuti - perisainya lebih jangkung
                    daripada lebar, jadi bingkai bujur sangkar membuatnya
                    gepeng. */}
                <Image
                    src="/logo-smpn14.png"
                    alt=""
                    width={373}
                    height={440}
                    className="h-8 w-auto shrink-0"
                />
                <div className="min-w-0">
                    <p className="text-[15px] leading-tight font-bold tracking-[-0.2px] text-sidebar-foreground">
                        SIPB
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                        SMP Negeri 14 Jakarta
                    </p>
                </div>
                {onTutup && (
                    <button
                        type="button"
                        onClick={onTutup}
                        aria-label="Tutup menu navigasi"
                        className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
                    >
                        <X className="size-5" strokeWidth={1.8} />
                    </button>
                )}
            </div>

            <div aria-hidden className="mx-4 mb-3 h-px bg-sidebar-border" />

            <SidebarNav
                role={user.role}
                onNavigate={onTutup}
                className="min-h-0 overflow-y-auto"
            />

            <PetakPengguna user={user} />
        </>
    );
}

function PetakPengguna({ user }: { user: User }) {
    const inisial = user.namaLengkap
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((kata) => kata[0]?.toUpperCase())
        .join("");

    return (
        <div className="mt-auto flex items-center gap-2.5 border-t border-sidebar-border px-4 py-3.5">
            <div
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-muted-foreground"
            >
                {inisial}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-sidebar-foreground">
                    {user.namaLengkap}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                    {LABEL_PERAN[user.role]}
                </p>
            </div>
            <a
                href="/auth/keluar"
                aria-label="Keluar"
                title="Keluar"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
            >
                <LogOut className="size-4" strokeWidth={1.5} />
            </a>
        </div>
    );
}
