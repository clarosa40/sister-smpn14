import "server-only";

import { ENVIRONMENT } from "@/config/environment";
import { createClient } from "@supabase/supabase-js";

/**
 * Klien service-role. Melewati RLS sepenuhnya.
 *
 * Di seluruh kode lain, pemeriksaan peran di server action adalah lapis
 * kedua dan policy RLS-lah gerbangnya. Di sini urutannya terbalik:
 * pastikanTataUsaha() ADALAH gerbangnya, dan di belakangnya tidak ada
 * apa-apa lagi. Karena itu berkas ini hanya dipanggil dari empat tempat -
 * buat akun, setel ulang sandi, hapus akun, dan pembersihan penanda
 * sandi_sementara milik sesi sendiri.
 *
 * `import "server-only"` di baris pertama bukan hiasan: kuncinya dibaca
 * di sini, bukan di src/config/environment.ts, sebab modul itu diimpor
 * oleh klien peramban dan oleh proxy, dan tidak punya penjaga apa pun.
 * Rahasia yang ditaruh di sana tinggal berjarak satu impor ceroboh dari
 * bundel peramban.
 *
 * createClient() dari @supabase/supabase-js, bukan @supabase/ssr: klien
 * ini tidak boleh menyentuh cookie sesi siapa pun. Ia bukan "pengguna
 * yang sedang masuk", ia alat administrasi.
 *
 * Alamat proyeknya tetap diambil dari ENVIRONMENT - itu memang nilai
 * publik, dan tidak ada gunanya menuliskannya dua kali. Hanya kuncinya
 * yang dibaca langsung di sini.
 */
export const createAdminClient = () => {
    const kunci = process.env.SUPABASE_SECRET_KEY;

    if (!kunci) {
        throw new Error(
            "SUPABASE_SECRET_KEY belum diatur. Tanpa itu akun tidak bisa dibuat, sandinya tidak bisa disetel ulang, dan akun tidak bisa dihapus.",
        );
    }

    return createClient(ENVIRONMENT.supabaseUrl!, kunci, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
};
