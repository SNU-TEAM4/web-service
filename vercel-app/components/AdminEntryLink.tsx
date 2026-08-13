import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function AdminEntryLink() {
  return (
    <Link className="admin-entry" href="/admin/login" aria-label="관리자 로그인">
      <ShieldCheck size={16} aria-hidden="true" />
      <span>관리자</span>
    </Link>
  );
}
