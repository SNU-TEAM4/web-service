import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isValidAdminSession } from "@/lib/admin-auth";
import AdminLoginForm from "./AdminLoginForm";

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  if (isValidAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) redirect("/admin");
  return <AdminLoginForm />;
}

