"use server";

import { pastikanPegawai, type HasilAksi } from "@/lib/aksi";
import {
    ambilDraft,
    GALAT_KERANJANG_HILANG,
    hapusDraftBilaKosong,
    MAKS_JUMLAH,
    pesanGalatPermintaan,
    type HasilKeranjang,
} from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const JALUR_KATALOG = "/katalog";
const JALUR_DAFTAR = "/permintaan-saya";

/**
 * Ketiga halaman yang bisa sedang menampilkan isi keranjang yang sama.
 * Tidak ada lencana keranjang di nav - keputusan yang disengaja - jadi
 * ketiganya inilah seluruh tempat yang perlu tahu.
 */
const segarkan = (permintaanId: string) => {
    revalidatePath(JALUR_KATALOG);
    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${permintaanId}`);
};

/**
 * Memasukkan satu barang ke keranjang, membuka keranjangnya kalau belum ada.
 *
 * Draftnya adalah keranjang - ia hidup di Postgres, bukan di peramban, jadi
 * ia selamat dari muat ulang, laptop yang ditutup, dan perpindahan ke
 * ponsel. Itu juga yang membuat penolakan barang berstok nol terjadi di
 * detik barang ditambahkan, bukan di saat pengajuan - saat penolakan paling
 * mahal harganya.
 */
export async function tambahKeKeranjang(barangId: string): Promise<HasilAksi> {
    const user = await pastikanPegawai();
    const supabase = await createClient();

    const draft = await ambilDraft(supabase, user.id);
    let permintaanId = draft?.id ?? null;
    const baruDibuka = permintaanId === null;

    if (permintaanId === null) {
        // keperluan diisi string kosong, bukan dibiarkan kosong: kolomnya
        // not null. Isinya ditanyakan nanti di dialog pengajuan - orang yang
        // cuma mau mengambil sekotak spidol tidak disodori formulir dulu.
        //
        // pemohon_id ditulis sendiri walau trigger sanggup mengisinya, sebab
        // policy buat_permintaan menguji kolom itu lewat WITH CHECK.
        const { data, error } = await supabase
            .from("permintaan")
            .insert({ pemohon_id: user.id, keperluan: "" })
            .select("id")
            .single<{ id: string }>();

        if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
        if (!data) return { ok: false, galat: GALAT_KERANJANG_HILANG };

        permintaanId = data.id;
    }

    const { error } = await supabase.from("permintaan_item").insert({
        permintaan_id: permintaanId,
        barang_id: barangId,
        jumlah_diminta: 1,
    });

    // 23505 berarti barangnya sudah ada di keranjang - hampir selalu karena
    // tab kedua sudah menambahkannya. Yang diminta pengguna sudah terpenuhi,
    // jadi ini bukan kegagalan. Sengaja tidak ditimpa dengan angka 1:
    // jumlah yang sudah disetel di tab itu bukan milik aksi ini.
    if (error && error.code !== "23505") {
        // Keranjang yang baru dibuka untuk barang yang ternyata ditolak -
        // stoknya nol - tidak boleh tertinggal sebagai keranjang kosong.
        if (baruDibuka) await hapusDraftBilaKosong(supabase, permintaanId);
        return { ok: false, galat: pesanGalatPermintaan(error) };
    }

    segarkan(permintaanId);
    return { ok: true };
}

/**
 * Menyetel jumlah satu barang di keranjang. Nol berarti mengeluarkannya,
 * dan barang terakhir yang keluar membawa serta keranjangnya.
 *
 * permintaanId datang dari pemanggil, bukan dicari ulang di sini: halaman
 * detail tahu keranjang mana yang sedang dibukanya, dan mencarinya ulang
 * akan membuat halaman itu menyunting keranjang lain kalau dua tab pernah
 * berlomba membuka draft.
 *
 * Tidak ada pemeriksaan kepemilikan. Policy susun_permintaan_item
 * menyempitkannya ke keranjang sendiri yang masih draft; pagar kedua di
 * sini hanya menambah satu tempat yang bisa melenceng.
 */
export async function setelJumlah(
    permintaanId: string,
    barangId: string,
    jumlah: number,
): Promise<HasilKeranjang> {
    await pastikanPegawai();

    const bulat = Math.trunc(jumlah);
    if (!Number.isFinite(bulat) || bulat < 0 || bulat > MAKS_JUMLAH) {
        return { ok: false, galat: `Jumlah harus antara 1 dan ${MAKS_JUMLAH}.` };
    }

    const supabase = await createClient();

    const { data, error } =
        bulat === 0
            ? await supabase
                  .from("permintaan_item")
                  .delete()
                  .eq("permintaan_id", permintaanId)
                  .eq("barang_id", barangId)
                  .select("id")
            : await supabase
                  .from("permintaan_item")
                  .update({ jumlah_diminta: bulat })
                  .eq("permintaan_id", permintaanId)
                  .eq("barang_id", barangId)
                  .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_KERANJANG_HILANG };

    const kosong =
        bulat === 0 && (await hapusDraftBilaKosong(supabase, permintaanId));

    segarkan(permintaanId);
    return { ok: true, kosong };
}
