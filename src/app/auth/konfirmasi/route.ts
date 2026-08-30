import {
    COOKIE_PEMULIHAN,
    JALUR_PEMULIHAN,
    opsiCookiePemulihan,
} from "@/lib/pemulihan";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Titik pendaratan tautan pemulihan dari email.
 *
 * Berbeda dari kesan pertama, di sini token belum ditukar. Rangkaiannya:
 * tautan tiba dengan `?token_hash=...` di query string (karena `@supabase/ssr`
 * mengunci flowType ke "pkce", token selalu di query, tidak pernah di
 * fragment); berkas ini hanya menyimpan token itu ke cookie, lalu memulangkan
 * pengguna ke formulirnya. verifyOtp baru dijalankan bersama updateUser di
 * server action milik formulir, saat kata sandi baru sudah siap disimpan.
 *
 * Alasannya: verifyOtp bersifat sekali pakai, sementara "mengklik tautan"
 * belum tentu berarti "sudah selesai mengganti kata sandi". Menunda penukaran
 * sampai penekanan tombol Simpan membuat klik pertama yang belum diselesaikan
 * tetap bisa dilanjutkan pada klik berikutnya.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;

    /**
     * Tautan tidak berbentuk pemulihan sama sekali - biasanya alamat yang
     * dikorek tangan atau bookmark lama. Bawa pengguna ke tempat yang masuk
     * akal untuk keadaannya. Pesan galat hanya berguna kalau memang bisa
     * dibaca, dan /login/lupa-sandi tidak bisa dibaca oleh yang sudah masuk
     * (proxy langsung memantulkannya ke /beranda).
     */
    if (!tokenHash || type !== "recovery") {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (user) {
            return NextResponse.redirect(new URL("/beranda", request.url));
        }

        const url = new URL("/login/lupa-sandi", request.url);
        url.searchParams.set("galat", "tautan");
        return NextResponse.redirect(url);
    }

    const lanjut = NextResponse.redirect(new URL(JALUR_PEMULIHAN, request.url));
    // Menimpa cookie sebelumnya, kalau ada. Yang paling baru selalu menang -
    // tautan permintaan reset yang lebih baru menggantikan yang lebih lama.
    lanjut.cookies.set(COOKIE_PEMULIHAN, tokenHash, opsiCookiePemulihan);
    return lanjut;
}
