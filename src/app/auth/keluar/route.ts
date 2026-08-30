import { ENVIRONMENT } from "@/config/environment";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keluar sungguhan, di tempat cookie memang boleh ditulis.
 *
 * DAL tidak bisa melakukannya: createClient() di server.ts membungkus
 * penulisan cookie-nya dalam catch kosong, karena merender Server
 * Component memang bukan tempat menyetel cookie. Akibatnya signOut()
 * dari sana tidak membersihkan apa pun di peramban, dan akun yang baru
 * dinonaktifkan memantul antara /login dan /beranda sampai tokennya
 * kedaluwarsa sendiri.
 *
 * Pengalihannya dibangun lebih dulu, lalu penulisan cookie milik klien
 * Supabase diikatkan langsung ke response itu - cara yang sama dipakai
 * proxy.ts:26-38 - supaya tidak ada pertanyaan apakah header Set-Cookie
 * ikut terbawa pada NextResponse yang dikembalikan.
 */
export async function GET(request: NextRequest) {
    // Hanya nilai yang sudah dikenal yang diteruskan. Query dari luar tidak
    // pernah dipantulkan apa adanya ke halaman berikutnya.
    const nonaktif = request.nextUrl.searchParams.get("alasan") === "nonaktif";

    const tujuan = new URL("/login", request.url);
    if (nonaktif) tujuan.searchParams.set("alasan", "nonaktif");

    const response = NextResponse.redirect(tujuan);

    const supabase = createServerClient(
        ENVIRONMENT.supabaseUrl!,
        ENVIRONMENT.supabaseKey!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // Galatnya sengaja tidak dihiraukan. Token yang sudah tidak sah membuat
    // panggilan ke server Auth gagal, tetapi sesi lokal tetap dibuang - dan
    // membuang sesi lokal itulah seluruh gunanya berkas ini.
    await supabase.auth.signOut();

    return response;
}
