import type { Metadata } from "next";
import { LupaSandiForm } from "./lupa-sandi-form";

export const metadata: Metadata = {
    title: "Lupa kata sandi — SIPB SMPN 14",
};

export default async function LupaSandiPage(
    props: PageProps<"/login/lupa-sandi">,
) {
    // /auth/konfirmasi memulangkan ke sini dengan ?galat=tautan kalau token
    // recovery-nya sudah dipakai atau kedaluwarsa.
    const { galat } = await props.searchParams;

    return <LupaSandiForm tautanGalat={galat === "tautan"} />;
}
