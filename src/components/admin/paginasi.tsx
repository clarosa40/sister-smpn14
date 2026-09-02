import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * Ringkasan "menampilkan x-y dari N" berikut tombol maju-mundurnya.
 *
 * Lahir sebagai bagian dalam master-barang/page.tsx dan pindah ke sini
 * begitu Riwayat persetujuan ikut memakainya. Dua hal yang dulu dipatri
 * - kata benda yang dihitung dan alamat halaman tetangga - kini datang
 * sebagai prop, sebab keduanya berbeda di setiap pemakainya.
 *
 * Tanpa "use client", dan prop href sengaja sebuah fungsi: berkas ini
 * hanya pernah dirender di server, jadi fungsi itu tidak pernah
 * menyeberangi batas serialisasi. Jangan mengimpornya dari komponen
 * klien.
 */
export function Paginasi({
    halaman,
    jumlahHalaman,
    dari,
    ditampilkan,
    total,
    satuan,
    href,
}: {
    halaman: number;
    jumlahHalaman: number;
    /** Indeks baris pertama halaman ini, dihitung dari 0. */
    dari: number;
    ditampilkan: number;
    total: number;
    /** Kata benda yang dihitung: "barang", "permintaan". */
    satuan: string;
    href: (halaman: number) => string;
}) {
    return (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
                Menampilkan {dari + 1}–{dari + ditampilkan} dari {total}{" "}
                {satuan}
            </p>

            {jumlahHalaman > 1 && (
                <div className="flex shrink-0 items-center gap-1.5">
                    <TautanHalaman href={href(halaman - 1)} aktif={halaman > 1}>
                        Sebelumnya
                    </TautanHalaman>
                    <span className="px-1 tabular-nums">
                        {halaman} / {jumlahHalaman}
                    </span>
                    <TautanHalaman
                        href={href(halaman + 1)}
                        aktif={halaman < jumlahHalaman}
                    >
                        Berikutnya
                    </TautanHalaman>
                </div>
            )}
        </div>
    );
}

function TautanHalaman({
    href,
    aktif,
    children,
}: {
    href: string;
    aktif: boolean;
    children: React.ReactNode;
}) {
    const kelas =
        "rounded-md border border-border px-2.5 py-1.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

    // Batas daftar disajikan sebagai teks mati, bukan tautan yang tidak
    // menuju ke mana-mana: pembaca layar ikut tahu tombolnya memang habis.
    if (!aktif) {
        return (
            <span aria-disabled className={cn(kelas, "opacity-40")}>
                {children}
            </span>
        );
    }

    return (
        <Link
            href={href}
            scroll={false}
            className={cn(kelas, "hover:bg-muted hover:text-foreground")}
        >
            {children}
        </Link>
    );
}
