import { AppShell } from "@/components/app-shell";
import { getUserOrRedirect } from "@/lib/dal";

export default async function DashboardLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    const user = await getUserOrRedirect();

    return <AppShell user={user}>{children}</AppShell>;
}
