import { cn } from "@/lib/utils";
import { Package } from "lucide-react";

/**
 * Kotak hijau bertanda paket. Satu-satunya bidang berwarna penuh di seluruh
 * antarmuka, jadi ia yang menandai merek di layar masuk maupun di sidebar.
 */
export function BrandMark({
    className,
    iconClassName,
}: {
    className?: string;
    iconClassName?: string;
}) {
    return (
        <div
            className={cn(
                "flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
                className,
            )}
        >
            <Package className={cn("size-4", iconClassName)} strokeWidth={2} />
        </div>
    );
}
