'use client';

import Image from "next/image";
import styles from "./page.module.css";
import { useState } from "react";

export default function Home() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [bulkData, setBulkData] = useState('');
  const [showImportTools, setShowImportTools] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setDetails(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setResult("✅ Sync completed successfully!");
        setDetails(data.updateResults || null);
      } else {
        setResult(`❌ Sync failed: ${data.error || data.message}`);
        setDetails(data.updateResults || null);
      }
    } catch (err) {
      setResult("❌ Sync failed: " + (err as Error).message);
    }
    setSyncing(false);
  };

  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch("/api/import-csv", { 
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(`✅ ${data.message}`);
      } else {
        setImportResult(`❌ Import failed: ${data.error}`);
      }
    } catch (err) {
      setImportResult("❌ Import failed: " + (err as Error).message);
    }
    setImporting(false);
  };

  const handleBulkAdd = async () => {
    if (!bulkData.trim()) return;

    setImporting(true);
    setImportResult(null);

    try {
      const products = JSON.parse(bulkData);
      const res = await fetch("/api/bulk-add", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(`✅ ${data.message}`);
        setBulkData('');
      } else {
        setImportResult(`❌ Bulk add failed: ${data.error}`);
      }
    } catch (err) {
      setImportResult("❌ Invalid JSON or request failed: " + (err as Error).message);
    }
    setImporting(false);
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        
        <h1>Flowtrac → Shopify Inventory Sync</h1>
        
        <ol>
          <li>
            Get started by editing <code>src/app/page.tsx</code>.
          </li>
          <li>Save and see your changes instantly.</li>
        </ol>

        {/* --- Sync Now Button and Feedback --- */}
        <div style={{ marginTop: 32, width: "100%", maxWidth: 480 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "1.1rem",
              borderRadius: "6px",
              background: syncing ? "#ccc" : "#0070f3",
              color: "#fff",
              border: "none",
              cursor: syncing ? "not-allowed" : "pointer",
              width: "100%",
              marginBottom: 16,
            }}
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          {result && (
            <div style={{ marginTop: 8, fontWeight: 500 }}>{result}</div>
          )}
          {details && (
            <div style={{ marginTop: 16 }}>
              <h4>Sync Results:</h4>
              <ul style={{ paddingLeft: 20 }}>
                {Object.entries(details).map(([sku, res]: any) => (
                  <li key={sku} style={{ color: res.success ? "green" : "red" }}>
                    <strong>{sku}:</strong> {res.success ? "Success" : `Error: ${res.error}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* --- Import Tools Section --- */}
        <div style={{ marginTop: 32, width: "100%", maxWidth: 480 }}>
          <button
            onClick={() => setShowImportTools(!showImportTools)}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "1rem",
              borderRadius: "6px",
              background: "#28a745",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              width: "100%",
              marginBottom: 16,
            }}
          >
            {showImportTools ? "Hide" : "Show"} Import Tools
          </button>

          {showImportTools && (
            <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 6 }}>
              <h3>Bulk Import Products</h3>
              
              {/* CSV Import */}
              <div style={{ marginBottom: 20 }}>
                <h4>CSV Import</h4>
                <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 8 }}>
                  Upload a CSV file with columns: shopify_sku, flowtrac_sku, product_name, [bundle_components]
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  disabled={importing}
                  style={{ width: "100%" }}
                />
              </div>

              {/* Bulk JSON Add */}
              <div style={{ marginBottom: 20 }}>
                <h4>Bulk JSON Add</h4>
                <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 8 }}>
                  Paste JSON array of products
                </p>
                <textarea
                  value={bulkData}
                  onChange={(e) => setBulkData(e.target.value)}
                  placeholder={`[
  {
    "shopify_sku": "IC-KOOL-0045",
    "flowtrac_sku": "IC-KOOL-0045", 
    "product_name": "Kool Aid Cherry",
    "bundle_components": []
  }
]`}
                  style={{
                    width: "100%",
                    height: 120,
                    padding: 8,
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    fontFamily: "monospace",
                    fontSize: "0.8rem"
                  }}
                />
                <button
                  onClick={handleBulkAdd}
                  disabled={importing || !bulkData.trim()}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.9rem",
                    borderRadius: "4px",
                    background: importing ? "#ccc" : "#0070f3",
                    color: "#fff",
                    border: "none",
                    cursor: importing ? "not-allowed" : "pointer",
                    marginTop: 8,
                  }}
                >
                  {importing ? "Importing..." : "Add Products"}
                </button>
              </div>

              {importResult && (
                <div style={{ 
                  marginTop: 16, 
                  padding: 8, 
                  borderRadius: 4,
                  background: importResult.includes("✅") ? "#d4edda" : "#f8d7da",
                  color: importResult.includes("✅") ? "#155724" : "#721c24"
                }}>
                  {importResult}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.ctas}>
          <a
            className={styles.primary}
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className={styles.logo}
              src="/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
            Deploy now
          </a>
          <a
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
          >
            Read our docs
          </a>
        </div>
      </main>
      <footer className={styles.footer}>
        <a
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn
        </a>
        <a
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Examples
        </a>
        <a
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}
