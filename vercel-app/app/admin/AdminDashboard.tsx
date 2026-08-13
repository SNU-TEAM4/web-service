"use client";

import Link from "next/link";
import Papa from "papaparse";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, LogOut, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { PriceRecord } from "@/lib/types";

type MenuOption = { brand: string; menu: string };
type PriceForm = {
  id: string;
  brand: string;
  menu: string;
  channel: string;
  storeName: string;
  price: string;
  checkedAt: string;
  sourceUrl: string;
  memo: string;
};

const emptyForm = (): PriceForm => ({
  id: "",
  brand: "",
  menu: "",
  channel: "매장",
  storeName: "전국 공통",
  price: "",
  checkedAt: new Date().toISOString().slice(0, 10),
  sourceUrl: "",
  memo: "",
});

async function readResponse(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

function csvValue(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

export default function AdminDashboard() {
  const router = useRouter();
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [menuOptions, setMenuOptions] = useState<MenuOption[]>([]);
  const [form, setForm] = useState<PriceForm>(emptyForm);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importItems, setImportItems] = useState<Array<Record<string, string | number>>>([]);
  const [importFileName, setImportFileName] = useState("");

  const loadPrices = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/prices", { cache: "no-store" });
      setPrices(await readResponse(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "가격 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();
    fetch("/data/menus.csv")
      .then((response) => response.text())
      .then((csv) => {
        const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
        setMenuOptions(rows.filter((row) => row.brand && row.menu).map((row) => ({ brand: row.brand, menu: row.menu })));
      })
      .catch(() => setError("메뉴 목록을 불러오지 못했습니다."));
  }, []);

  const brands = useMemo(() => Array.from(new Set(menuOptions.map((item) => item.brand))), [menuOptions]);
  const menus = useMemo(
    () => menuOptions.filter((item) => item.brand === form.brand).map((item) => item.menu),
    [menuOptions, form.brand],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term
      ? prices.filter((item) => `${item.brand} ${item.menu} ${item.channel} ${item.storeName}`.toLowerCase().includes(term))
      : prices;
  }, [prices, query]);
  const averagePrice = prices.length ? Math.round(prices.reduce((sum, item) => sum + item.price, 0) / prices.length) : 0;

  const clearMessages = () => { setNotice(""); setError(""); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    clearMessages();
    setSaving(true);
    try {
      const response = await fetch("/api/admin/prices", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      });
      await readResponse(response);
      setNotice(form.id ? "가격을 수정했습니다." : "가격을 등록했습니다.");
      setForm(emptyForm());
      await loadPrices();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "가격을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const edit = (item: PriceRecord) => {
    setForm({ ...item, price: String(item.price) });
    clearMessages();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (item: PriceRecord) => {
    if (!window.confirm(`${item.brand} · ${item.menu} 가격을 삭제할까요?`)) return;
    clearMessages();
    try {
      const response = await fetch(`/api/admin/prices?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      await readResponse(response);
      setNotice("가격을 삭제했습니다.");
      await loadPrices();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "가격을 삭제하지 못했습니다.");
    }
  };

  const readCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    clearMessages();
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) {
      setError(`CSV를 읽지 못했습니다: ${parsed.errors[0].message}`);
      return;
    }
    const items = parsed.data.map((row) => ({
      brand: csvValue(row, "brand", "브랜드"),
      menu: csvValue(row, "menu", "메뉴"),
      channel: csvValue(row, "channel", "채널") || "매장",
      storeName: csvValue(row, "store_name", "storeName", "매장명") || "전국 공통",
      price: Number(csvValue(row, "price", "가격")),
      checkedAt: csvValue(row, "checked_at", "checkedAt", "확인일"),
      sourceUrl: csvValue(row, "source_url", "sourceUrl", "출처"),
      memo: csvValue(row, "memo", "메모"),
    }));
    setImportItems(items);
    setImportFileName(file.name);
    setNotice(`${items.length.toLocaleString()}개 행을 확인했습니다. 업로드 버튼을 눌러 반영하세요.`);
  };

  const uploadCsv = async () => {
    if (!importItems.length) return;
    clearMessages();
    setSaving(true);
    try {
      const response = await fetch("/api/admin/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: importItems }),
      });
      await readResponse(response);
      setNotice(`${importItems.length.toLocaleString()}개의 가격을 반영했습니다.`);
      setImportItems([]);
      setImportFileName("");
      await loadPrices();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CSV를 반영하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const csv = Papa.unparse(prices.map((item) => ({
      brand: item.brand,
      menu: item.menu,
      channel: item.channel,
      store_name: item.storeName,
      price: item.price,
      checked_at: item.checkedAt,
      source_url: item.sourceUrl,
      memo: item.memo,
    })));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `hanip-prices-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><span className="admin-kicker">HANIP ANSIM ADMIN</span><h1>가격 데이터 관리</h1><p>직접 확인한 가격을 한 건씩 입력하거나 CSV로 일괄 반영할 수 있습니다.</p></div>
        <div className="admin-header-actions"><Link href="/">서비스 보기</Link><button onClick={logout}><LogOut size={16} /> 로그아웃</button></div>
      </header>

      <section className="admin-metrics">
        <div><span>등록 가격</span><b>{prices.length.toLocaleString()}건</b></div>
        <div><span>등록 브랜드</span><b>{new Set(prices.map((item) => item.brand)).size}개</b></div>
        <div><span>평균 확인가</span><b>{averagePrice ? `${averagePrice.toLocaleString()}원` : "—"}</b></div>
      </section>

      {(notice || error) && <div className={`admin-alert ${error ? "error" : "success"}`} role="status">{error || notice}</div>}

      <div className="admin-grid">
        <section className="admin-card">
          <div className="admin-section-title"><div><span>직접 입력</span><h2>{form.id ? "가격 수정" : "새 가격 등록"}</h2></div>{form.id && <button className="admin-icon-button" onClick={() => setForm(emptyForm())} aria-label="수정 취소"><X size={18} /></button>}</div>
          <form className="admin-price-form" onSubmit={submit}>
            <label><span>브랜드</span><select required value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value, menu: "" })}><option value="">선택</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label>
            <label><span>메뉴</span><select required disabled={!form.brand} value={form.menu} onChange={(event) => setForm({ ...form, menu: event.target.value })}><option value="">선택</option>{menus.map((menu) => <option key={menu}>{menu}</option>)}</select></label>
            <label><span>판매 채널</span><select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}><option>매장</option><option>포장</option><option>배달</option><option>기타</option></select></label>
            <label><span>매장명/범위</span><input required maxLength={120} value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} /></label>
            <label><span>가격(원)</span><input type="number" min="1" max="1000000" step="1" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="5900" /></label>
            <label><span>확인일</span><input type="date" required value={form.checkedAt} onChange={(event) => setForm({ ...form, checkedAt: event.target.value })} /></label>
            <label className="wide"><span>출처 URL (선택)</span><input type="url" maxLength={500} value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://" /></label>
            <label className="wide"><span>메모 (선택)</span><textarea maxLength={500} rows={3} value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} placeholder="행사 가격, 지점 특이사항 등" /></label>
            <button className="admin-primary wide" disabled={saving}>{saving ? "저장 중…" : form.id ? "수정 저장" : <><Plus size={17} /> 가격 등록</>}</button>
          </form>
        </section>

        <section className="admin-card admin-import-card">
          <div className="admin-section-title"><div><span>일괄 반영</span><h2>CSV 업로드</h2></div><FileUp size={22} /></div>
          <p>영문 또는 한글 헤더를 지원합니다. 같은 브랜드·메뉴·채널·매장 데이터는 새 가격으로 갱신됩니다.</p>
          <code>brand, menu, channel, store_name, price, checked_at, source_url, memo</code>
          <label className="admin-file-input"><FileUp size={19} /><span>{importFileName || "CSV 파일 선택"}</span><input type="file" accept=".csv,text/csv" onChange={readCsv} /></label>
          <button className="admin-secondary" disabled={!importItems.length || saving} onClick={uploadCsv}>{importItems.length ? `${importItems.length.toLocaleString()}개 가격 반영` : "업로드할 파일을 선택하세요"}</button>
          <button className="admin-text-button" disabled={!prices.length} onClick={exportCsv}><Download size={16} /> 현재 가격 CSV 내려받기</button>
        </section>
      </div>

      <section className="admin-card admin-list-card">
        <div className="admin-list-head"><div><span>저장 데이터</span><h2>가격 목록</h2></div><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="브랜드·메뉴 검색" /></label></div>
        {loading ? <div className="admin-empty">가격 데이터를 불러오는 중…</div> : !filtered.length ? <div className="admin-empty">{error ? "Supabase 연결 후 가격 목록이 표시됩니다." : "등록된 가격이 없습니다."}</div> : (
          <div className="admin-table-wrap"><table><thead><tr><th>브랜드·메뉴</th><th>채널·매장</th><th>확인 가격</th><th>확인일</th><th>관리</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><b>{item.menu}</b><small>{item.brand}</small></td><td><b>{item.channel}</b><small>{item.storeName}</small></td><td><strong>{item.price.toLocaleString()}원</strong>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">출처</a>}</td><td>{item.checkedAt}</td><td><div className="admin-row-actions"><button onClick={() => edit(item)} aria-label="수정"><Pencil size={16} /></button><button className="delete" onClick={() => remove(item)} aria-label="삭제"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>
        )}
      </section>
    </main>
  );
}

