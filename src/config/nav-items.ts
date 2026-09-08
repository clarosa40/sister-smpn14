import type { Role } from "@/lib/dal";
import {
    Building2,
    CircleCheck,
    ClipboardList,
    Database,
    Download,
    FileText,
    House,
    Package,
    UnfoldHorizontal,
    Users,
    type LucideIcon,
} from "lucide-react";

export type NavItem = {
    label: string;
    href: string;
    icon: LucideIcon;
    roles: Role[];
};

const SEMUA_PERAN: Role[] = ["pegawai", "pengurus_barang", "tata_usaha"];

// Urutan di sini adalah urutan di sidebar. Setiap peran melihat Beranda lebih
// dulu, lalu butir-butir yang khusus untuknya.
export const NAV_ITEMS: NavItem[] = [
    { label: "Beranda", href: "/beranda", icon: House, roles: SEMUA_PERAN },

    // Pegawai
    {
        label: "Katalog Barang",
        href: "/katalog",
        icon: Package,
        roles: ["pegawai"],
    },
    {
        label: "Permintaan Saya",
        href: "/permintaan-saya",
        icon: FileText,
        roles: ["pegawai"],
    },

    // Pengurus Barang - menyetujui, lalu melihat stok yang disetujuinya
    {
        label: "Persetujuan",
        href: "/persetujuan",
        icon: CircleCheck,
        roles: ["pengurus_barang"],
    },
    {
        label: "Stok Barang",
        href: "/stok",
        icon: Package,
        roles: ["pengurus_barang", "tata_usaha"],
    },

    // Tata Usaha - data induk, lalu pekerjaan gudang dalam urutan kejadiannya:
    // menerima, menyiapkan, lalu menyesuaikan hitungan
    {
        label: "Master Barang",
        href: "/master-barang",
        icon: Database,
        roles: ["tata_usaha"],
    },
    {
        label: "Unit Kerja",
        href: "/unit-kerja",
        icon: Building2,
        roles: ["tata_usaha"],
    },
    {
        label: "Kelola Pengguna",
        href: "/pengguna",
        icon: Users,
        roles: ["tata_usaha"],
    },
    {
        label: "Penerimaan",
        href: "/penerimaan",
        icon: Download,
        roles: ["tata_usaha"],
    },
    {
        label: "Permintaan Masuk",
        href: "/permintaan-masuk",
        icon: ClipboardList,
        roles: ["tata_usaha"],
    },
    {
        label: "Penyesuaian",
        href: "/penyesuaian",
        icon: UnfoldHorizontal,
        roles: ["tata_usaha"],
    },
];

export const navUntukPeran = (role: Role): NavItem[] =>
    NAV_ITEMS.filter((item) => item.roles.includes(role));

export const LABEL_PERAN: Record<Role, string> = {
    pegawai: "Pegawai",
    pengurus_barang: "Pengurus Barang",
    tata_usaha: "Tata Usaha",
};
