/**
 * Impor massal akun pegawai dari Excel.
 *
 * Akun tidak bisa dibuat lewat SQL: auth.users menyimpan sandi ter-hash
 * dan menuntut baris auth.identities pasangannya, keduanya milik GoTrue.
 * Karena itu skrip ini memakai Admin API yang sama dengan buatAkun() di
 * src/app/(dashboard)/pengguna/actions.ts, dan menyalin keempat
 * propertinya persis - termasuk penanda app_metadata.sandi_sementara
 * yang menahan orangnya di /ganti-sandi sampai ia memilih sandi sendiri.
 *
 * Baku kering: tanpa --tulis tidak ada satu pun akun yang dibuat.
 *
 *   node scripts/impor-pegawai.mjs pegawai.xlsx
 *   node scripts/impor-pegawai.mjs pegawai.xlsx --tulis
 *
 * Kolom dikenali dari judulnya, bebas urutan dan bebas huruf besar:
 *   nama | unit kerja | role/peran | username
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { alamatDari, namaPenggunaDari } from "../src/lib/alamat.ts";
import { sandiSementara } from "../src/lib/sandi.ts";

const PANJANG_NAMA = 120;
const PERAN = ["pegawai", "pengurus_barang", "tata_usaha"];

/**
 * Excel sekolah memakai kata yang dipakai orang, bukan nilai enum.
 * Pemetaannya ikut dicetak di jalan kering supaya tata usaha melihat
 * "sarpras -> pengurus_barang" sebelum ada akun yang lahir.
 */
const ALIAS_PERAN = {
    guru: "pegawai",
    pegawai: "pegawai",
    staf: "pegawai",
    sarpras: "pengurus_barang",
    pengurus: "pengurus_barang",
    pengurus_barang: "pengurus_barang",
    tu: "tata_usaha",
    tata_usaha: "tata_usaha",
};

const JUDUL = {
    nama: ["nama", "nama lengkap", "nama_lengkap"],
    unit: ["unit kerja", "unit_kerja", "unit", "bagian"],
    role: ["role", "peran", "jabatan"],
    user: ["username", "nama pengguna", "nama_pengguna", "user", "email"],
};

const rapikan = (v) => String(v ?? "").trim();
const kunciPeran = (v) => rapikan(v).toLowerCase().replace(/[\s-]+/g, "_");

/** Judul yang dikenali -> nama kolom sebenarnya di berkas. */
export function petakanKolom(judulBerkas) {
    const peta = {};
    for (const [bidang, calon] of Object.entries(JUDUL)) {
        const ketemu = judulBerkas.find((j) =>
            calon.includes(j.trim().toLowerCase()),
        );
        if (ketemu) peta[bidang] = ketemu;
    }
    return peta;
}

/**
 * Seluruh pemeriksaan, terpisah dari I/O supaya bisa diuji sendiri.
 * Mengembalikan baris siap-tulis beserta daftar galatnya; satu galat
 * saja sudah cukup untuk membatalkan seluruh impor di pemanggilnya.
 */
export function periksaBaris(baris, peta, unitKerja, sudahAda) {
    const siap = [];
    const galat = [];
    const lewat = [];
    const terlihat = new Set();

    baris.forEach((r, i) => {
        const nomor = i + 2; // baris 1 judul
        const salah = (pesan) => galat.push(`baris ${nomor}: ${pesan}`);

        const nama = rapikan(r[peta.nama]);
        const unit = rapikan(r[peta.unit]);
        const peran = ALIAS_PERAN[kunciPeran(r[peta.role])];
        const user = rapikan(r[peta.user]).toLowerCase();

        if (!nama) return salah("nama lengkap kosong");
        if (nama.length > PANJANG_NAMA) {
            return salah(`nama lebih dari ${PANJANG_NAMA} karakter`);
        }

        // Alamat lengkap di kolom username dipotong di "@", domain apa
        // pun - "budi@gmail.com" jadi akun "budi@smpn14.local". Excel
        // sekolah memuat alamat pribadi di kolom ini dan yang dimaksud
        // memang nama penggunanya, bukan alamat itu sendiri.
        //
        // Berbeda dari buatAkun(), yang menolak "@" mentah-mentah -
        // di sana masukannya datang dari POST yang bisa direkayasa.
        // Di sini sumbernya satu berkas yang sudah di depan mata, dan
        // jalan kering mencetak alamat hasil setiap baris sebelum ada
        // akun yang lahir, jadi penulisan ulang ini kelihatan.
        //
        // Tabrakan yang ditimbulkannya - budi@gmail.com dan
        // budi@yahoo.com jadi akun yang sama - tertangkap pemeriksaan
        // duplikat di bawah, bukan dibiarkan menimpa diam-diam.
        const hasil = alamatDari(
            user.includes("@") ? namaPenggunaDari(user) : user,
        );
        if (!hasil.ok) return salah(`username "${user}" - ${hasil.galat}`);

        if (terlihat.has(hasil.alamat)) {
            return salah(`username "${user}" muncul dua kali di berkas`);
        }
        terlihat.add(hasil.alamat);

        if (!peran || !PERAN.includes(peran)) {
            return salah(`peran "${rapikan(r[peta.role])}" tidak dikenal`);
        }

        const unitId = unitKerja.get(unit.toLowerCase());
        if (!unitId) return salah(`unit kerja "${unit}" tidak ada di master`);

        // Akun yang sudah ada dilewati, bukan digagalkan: impor yang
        // putus di tengah harus bisa dijalankan ulang apa adanya.
        if (sudahAda.has(hasil.alamat)) {
            lewat.push(hasil.alamat);
            return;
        }

        siap.push({
            nomor,
            nama,
            email: hasil.alamat,
            role: peran,
            unitId,
            unit,
        });
    });

    return { siap, galat, lewat };
}

async function utama() {
    const [berkas, ...bendera] = process.argv.slice(2);
    const tulis = bendera.includes("--tulis");

    if (!berkas) {
        console.error(
            "Pakai: node scripts/impor-pegawai.mjs <berkas.xlsx> [--tulis]",
        );
        process.exit(1);
    }

    process.loadEnvFile(".env.local");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const kunci = process.env.SUPABASE_SECRET_KEY;
    if (!url || !kunci) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY belum diatur di .env.local",
        );
    }

    // Kunci publishable di slot yang salah adalah kekeliruan yang paling
    // mudah dilakukan - namanya mirip dan letaknya bersebelahan di
    // dashboard. Tanpa pagar ini akibatnya tidak terbaca sebagai salah
    // kunci sama sekali: PostgREST menjalankan query sebagai anon, RLS
    // memulangkan nol baris TANPA galat, dan skrip ini melaporkan seluruh
    // isi Excel bermasalah.
    if (kunci === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
        throw new Error(
            "SUPABASE_SECRET_KEY berisi kunci publishable. Ambil kunci secret (sb_secret_...) di Dashboard > Project Settings > API Keys.",
        );
    }
    if (kunci.startsWith("sb_publishable_")) {
        throw new Error(
            "SUPABASE_SECRET_KEY berawalan sb_publishable_. Yang dibutuhkan kunci secret (sb_secret_...).",
        );
    }

    const db = createClient(url, kunci, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // Sekalian buktikan kuncinya benar-benar service-role sebelum ada
    // satu baris pun dibaca: endpoint ini menolak kunci lain.
    const { error: galatKunci } = await db.auth.admin.listUsers({ perPage: 1 });
    if (galatKunci) {
        throw new Error(
            `Kunci ditolak Auth: ${galatKunci.message}. Pastikan SUPABASE_SECRET_KEY memang kunci secret proyek ${url}.`,
        );
    }

    const buku = xlsx.read(readFileSync(berkas));
    const lembar = buku.Sheets[buku.SheetNames[0]];
    const baris = xlsx.utils.sheet_to_json(lembar, { defval: "" });
    if (!baris.length) throw new Error("Lembar pertama kosong");

    const peta = petakanKolom(Object.keys(baris[0]));
    const hilang = Object.keys(JUDUL).filter((k) => !peta[k]);
    if (hilang.length) {
        throw new Error(
            `Kolom tidak ketemu: ${hilang.join(", ")}. Judul di berkas: ${Object.keys(baris[0]).join(" | ")}`,
        );
    }

    // Galat kedua query ini tidak boleh ditelan. unit_kerja yang gagal
    // terbaca menghasilkan peta kosong, dan peta kosong membuat SETIAP
    // baris dilaporkan "unit kerja tidak ada di master" - galat jaringan
    // menyamar jadi berkas Excel yang salah. Yang lebih buruk, pengguna
    // yang gagal terbaca membuat daftar akun-yang-sudah-ada kosong,
    // sehingga --tulis mencoba membuat ulang akun yang sudah berdiri.
    const { data: unit, error: galatUnit } = await db
        .from("unit_kerja")
        .select("id, nama");
    if (galatUnit) {
        throw new Error(`Gagal membaca unit_kerja: ${galatUnit.message}`);
    }
    if (!unit?.length) {
        throw new Error("Tabel unit_kerja kosong - seed belum dijalankan?");
    }
    const unitKerja = new Map(unit.map((u) => [u.nama.toLowerCase(), u.id]));

    const { data: ada, error: galatAda } = await db
        .from("pengguna")
        .select("email");
    if (galatAda) {
        throw new Error(`Gagal membaca daftar akun: ${galatAda.message}`);
    }
    const sudahAda = new Set(ada.map((p) => p.email));

    const { siap, galat, lewat } = periksaBaris(baris, peta, unitKerja, sudahAda);

    console.log(
        `Kolom  : ${Object.entries(peta)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`,
    );
    console.log(`Terbaca: ${baris.length} baris`);
    if (lewat.length) console.log(`Dilewati (akun sudah ada): ${lewat.length}`);

    if (galat.length) {
        console.error(
            `\n${galat.length} baris bermasalah - tidak ada akun yang dibuat:`,
        );
        for (const g of galat) console.error("  " + g);
        process.exit(1);
    }

    console.log(`Akan dibuat: ${siap.length} akun`);
    for (const s of siap) {
        console.log(
            `  ${s.email.padEnd(28)} ${s.role.padEnd(16)} ${s.unit.padEnd(18)} ${s.nama}`,
        );
    }

    if (!tulis) {
        console.log(
            "\nJalan kering. Tambahkan --tulis untuk benar-benar membuat akun.",
        );
        return;
    }

    const hasil = [];
    for (const s of siap) {
        const sandi = sandiSementara();

        const { data, error } = await db.auth.admin.createUser({
            email: s.email,
            password: sandi,
            // Melewati surel verifikasi, yang memang tidak akan terkirim
            // ke mana-mana: proyek ini tanpa SMTP sendiri.
            email_confirm: true,
            user_metadata: { nama_lengkap: s.nama },
            // app_metadata, bukan user_metadata: hanya service role yang
            // boleh menulisnya, jadi pemiliknya tidak bisa membersihkan
            // penandanya sendiri lalu melewati /ganti-sandi.
            app_metadata: { sandi_sementara: true },
        });

        if (error) {
            console.error(`  GAGAL ${s.email}: ${error.message}`);
            continue;
        }

        // handle_new_user() sudah membuat baris profilnya dalam transaksi
        // yang sama; tinggal peran dan unit kerjanya. Lewat service_role,
        // jadi jaga_profil() pulang lebih dulu dan periksaBaris di ataslah
        // satu-satunya penjaga yang tersisa.
        const { error: galatProfil } = await db
            .from("profil")
            .update({ role: s.role, unit_kerja_id: s.unitId })
            .eq("id", data.user.id);

        if (galatProfil) {
            console.error(
                `  SEPARUH ${s.email}: akun ada, peran belum - ${galatProfil.message}`,
            );
            continue;
        }

        hasil.push({ nama: s.nama, email: s.email, sandi });
        console.log(`  ok ${s.email}`);
    }

    // Ditulis di sebelah Excel sumbernya, bukan di cwd: folder impor/
    // sudah diabaikan git, dan CSV ini memuat sandi seluruh sekolah
    // dalam teks polos. Menaruhnya di cwd berarti ia mendarat di akar
    // repo begitu skrip dijalankan dari tempat lain.
    const keluaran = path.join(path.dirname(berkas), "sandi-sementara.csv");
    writeFileSync(
        keluaran,
        "nama,username,sandi\n" +
            hasil
                .map(
                    (h) =>
                        `"${h.nama.replaceAll('"', '""')}",${namaPenggunaDari(h.email)},${h.sandi}`,
                )
                .join("\n") +
            "\n",
        "utf8",
    );
    console.log(
        `\n${hasil.length} akun dibuat. Sandi ada di ${keluaran} - bagikan lalu HAPUS berkas itu.`,
    );
}

if (import.meta.filename === process.argv[1]) await utama();
