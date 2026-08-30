// =============================================================
// Membuat tautan reset kata sandi tanpa lewat email.
//
//   npm run reset:tautan -- guru@sekolah.sch.id
//
// Berguna kalau akun ujinya memakai alamat email karangan: Admin
// API mencetak token recovery-nya langsung, jadi seluruh rantai
// tetap teruji kecuali satu langkah pengiriman email.
//
// Perlu secret key (Dashboard > Project Settings > API Keys).
// Simpan di .env.local sebagai SUPABASE_SECRET_KEY - berkas itu
// sudah masuk .gitignore. Jangan pernah dipakai dari sisi peramban.
// =============================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ENV = new URL("../../.env.local", import.meta.url);

const baca = () =>
    Object.fromEntries(
        readFileSync(ENV, "utf8")
            .split("\n")
            .map((baris) => baris.trim())
            .filter((baris) => baris && !baris.startsWith("#"))
            .map((baris) => {
                const pisah = baris.indexOf("=");
                return [baris.slice(0, pisah), baris.slice(pisah + 1)];
            }),
    );

const env = baca();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SECRET_KEY;
const email = process.argv[2];
const asal = process.argv[3] ?? "http://localhost:3000";

if (!email) {
    console.error("Pakai: npm run reset:tautan -- <email akun>");
    process.exit(1);
}

if (!secret) {
    console.error(
        "SUPABASE_SECRET_KEY belum ada.\n" +
            "Ambil di Dashboard > Project Settings > API Keys, lalu tambahkan\n" +
            "baris berikut ke .env.local:\n\n" +
            "  SUPABASE_SECRET_KEY=sb_secret_...\n",
    );
    process.exit(1);
}

const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
});

if (error) {
    console.error(`Gagal: ${error.message}`);
    process.exit(1);
}

// Bentuknya sengaja sama persis dengan yang dikirim template email,
// jadi yang diuji benar-benar jalur yang dipakai pengguna sungguhan.
const tautan = new URL("/auth/konfirmasi", asal);
tautan.searchParams.set("token_hash", data.properties.hashed_token);
tautan.searchParams.set("type", "recovery");

console.log(`\n  ${email}\n\n${tautan}\n`);
console.log("Sekali pakai. Klik kedua kalinya harus mendarat di");
console.log("/login/lupa-sandi?galat=tautan\n");
