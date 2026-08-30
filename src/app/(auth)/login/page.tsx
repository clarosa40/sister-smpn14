import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
    title: "Masuk — SIPB SMPN 14",
};

export default function LoginPage() {
    return <LoginForm />;
}
