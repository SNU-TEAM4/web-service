"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";

export default function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "로그인하지 못했습니다.");
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <div className="admin-login-icon"><LockKeyhole size={28} /></div>
        <span className="admin-kicker">HANIP ANSIM ADMIN</span>
        <h1>관리자 로그인</h1>
        <p>가격 데이터 관리 권한이 있는 사용자만 접근할 수 있습니다.</p>
        <form onSubmit={login}>
          <label>
            <span>관리자 비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              placeholder="비밀번호 입력"
            />
          </label>
          {error && <div className="admin-alert error" role="alert">{error}</div>}
          <button className="admin-primary" disabled={loading || !password}>
            {loading ? "확인 중…" : "로그인"}
          </button>
        </form>
        <Link className="admin-back-link" href="/"><ArrowLeft size={16} /> 서비스로 돌아가기</Link>
      </section>
    </main>
  );
}

