import Image from "next/image";

export default function AuthLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="relative flex min-h-svh flex-col items-center bg-background px-4 py-8 sm:py-12">
            {/* Garis aksen setipis mungkin di bibir atas layar. Satu-satunya
                hiasan di halaman ini, dan yang menahan seluruh komposisi. */}
            <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[3px] bg-primary"
            />

            {/* Kartu dipusatkan pada ruang yang tersisa, bukan pada layar. Di
                layar pendek kartunya tetap utuh dan halaman ikut menggulir,
                dengan footer tetap di bawahnya - bukan menimpanya. */}
            <main className="my-auto w-full max-w-[400px] rounded-xl border border-border bg-card p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] sm:p-9">
                <header className="mb-7 flex flex-col items-center">
                    {/* Lambang sekolah jadi satu-satunya bidang berwarna penuh
                        di atas garis pemisah; hijau aksen baru muncul lagi di
                        tombol, jauh di bawahnya - jadi dua cerita warna itu
                        tidak pernah bersebelahan. Ukurannya dikunci lewat
                        tinggi saja: perisainya lebih jangkung daripada lebar
                        (0,85), dan memaksanya jadi bujur sangkar membuatnya
                        gepeng. */}
                    <Image
                        src="/logo-smpn14.png"
                        alt="Lambang SMP Negeri 14 Jakarta"
                        width={373}
                        height={440}
                        priority
                        className="h-26 w-auto"
                    />
                    <p className="mt-4 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                        SIPB
                    </p>
                    <p className="mt-1 text-center text-[13px] leading-normal text-muted-foreground">
                        Sistem Informasi Permintaan Barang
                    </p>
                </header>

                <div aria-hidden className="mb-6 h-px bg-border" />

                {children}
            </main>

            <footer className="pt-8 text-xs text-muted-foreground/70">
                &copy; 2026 SMP Negeri 14 Jakarta
            </footer>
        </div>
    );
}
