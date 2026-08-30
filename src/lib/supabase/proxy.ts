import { ENVIRONMENT } from "@/config/environment";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Tidak mengharapkan sesi. Pengunjung yang sudah masuk dipulangkan ke beranda.
const TANPA_SESI = ["/login", "/login/lupa-sandi"];

// Mengharapkan sesi, tetapi bukan sesi biasa: ini jalur pemulihan kata sandi.
// Dibiarkan lewat ke dua arah, sebab pemakainya berpindah dari tanpa-sesi ke
// bersesi di tengah jalur, dan aturan mana pun akan memutusnya di salah satu sisi.
const PEMULIHAN = ["/auth/konfirmasi", "/login/reset-sandi"];

export const supabaseProxy = async (request: NextRequest) => {
    let supabaseResponse = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        ENVIRONMENT.supabaseUrl!,
        ENVIRONMENT.supabaseKey!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value),
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // Memanggil getUser() sekaligus menyegarkan sesi: kalau access token sudah
    // basi, refresh token ditukar di sini dan pasangan barunya ditulis ke
    // supabaseResponse lewat setAll di atas.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    if (PEMULIHAN.includes(pathname)) {
        return supabaseResponse;
    }

    // Supabase memutar refresh token setiap kali dipakai, jadi cookie hasil
    // penyegaran di atas harus ikut pada setiap pengalihan. NextResponse.redirect
    // yang polos membuangnya: penyegaran terjadi di server tetapi peramban tidak
    // pernah tahu, lalu mencoba lagi dengan cookie lama pada permintaan berikutnya.
    const alihkan = (tujuan: string) => {
        const url = request.nextUrl.clone();
        url.pathname = tujuan;
        // clone() ikut membawa query string, dan parameter itu ditujukan untuk
        // halaman asal - bukan untuk tujuannya. Tanpa baris ini, sebuah
        // pengalihan dari /login/lupa-sandi?galat=tautan mendarat sebagai
        // /beranda?galat=tautan.
        url.search = "";
        const response = NextResponse.redirect(url);
        supabaseResponse.cookies
            .getAll()
            .forEach((cookie) => response.cookies.set(cookie));
        return response;
    };

    if (!user && !TANPA_SESI.includes(pathname)) {
        return alihkan("/login");
    }

    if (user && TANPA_SESI.includes(pathname)) {
        return alihkan("/beranda");
    }

    return supabaseResponse;
};
