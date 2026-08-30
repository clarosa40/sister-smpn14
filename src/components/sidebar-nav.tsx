"use client";

import { navUntukPeran } from "@/config/nav-items";
import type { Role } from "@/lib/dal";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNav({
    role,
    onNavigate,
    className,
}: {
    role: Role;
    onNavigate?: () => void;
    className?: string;
}) {
    const pathname = usePathname();
    const items = navUntukPeran(role);

    return (
        <nav className={cn("flex flex-1 flex-col gap-0.5 px-3", className)}>
            {items.map(({ label, href, icon: Icon }) => {
                // startsWith supaya halaman rincian di bawah sebuah butir tetap
                // menyalakan induknya nanti.
                const aktif =
                    pathname === href || pathname.startsWith(`${href}/`);

                return (
                    <Link
                        key={href}
                        href={href}
                        onClick={onNavigate}
                        aria-current={aktif ? "page" : undefined}
                        className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 md:py-2 md:text-[13px]",
                            aktif
                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                    >
                        <Icon
                            className="size-[18px] shrink-0"
                            strokeWidth={1.5}
                        />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
