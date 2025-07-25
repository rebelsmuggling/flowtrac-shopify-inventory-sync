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
  const [exporting, setExporting] = useState(false);
  const [mappingData, setMappingData] = useState<any>(null);
  const [loadingMapping, setLoadingMapping] = useState(false);

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
        // Refresh mapping data after import
        loadMappingData();
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
        // Refresh mapping data after import
        loadMappingData();
      } else {
        setImportResult(`❌ Bulk add failed: ${data.error}`);
      }
    } catch (err) {
      setImportResult("❌ Invalid JSON or request failed: " + (err as Error).message);
    }
    setImporting(false);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/export-csv");
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mapping-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Export failed');
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  const loadMappingData = async () => {
    setLoadingMapping(true);
    try {
      const res = await fetch("/api/mapping");
      const data = await res.json();
      if (data.success) {
        setMappingData(data);
      }
    } catch (err) {
      console.error('Failed to load mapping:', err);
    }
    setLoadingMapping(false);
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
                {Object.entries(details).map(([sku, res]: any) => {
                  // Handle different result structures
                  if (sku === 'shipstation') {
                    // ShipStation results are nested
                    return Object.entries(res).map(([ssSku, ssRes]: any) => (
                      <li key={`shipstation-${ssSku}`} style={{ color: ssRes.success ? "green" : "red" }}>
                        <strong>ShipStation {ssSku}:</strong> {ssRes.success ? "Success" : `Error: ${ssRes.error || 'Unknown error'}`}
                      </li>
                    ));
                  } else {
                    // Regular SKU results have shopify and amazon properties
                    const shopifyResult = res.shopify;
                    const amazonResult = res.amazon;
                    return (
                      <li key={sku}>
                        <strong>{sku}:</strong>
                        <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                          <li style={{ color: shopifyResult?.success ? "green" : "red" }}>
                            Shopify: {shopifyResult?.success ? "Success" : `Error: ${shopifyResult?.error || 'Unknown error'}`}
                          </li>
                          {amazonResult && (
                            <li style={{ color: amazonResult?.success ? "green" : "red" }}>
                              Amazon: {amazonResult?.success ? "Success" : `Error: ${amazonResult?.error || 'Unknown error'}`}
                            </li>
                          )}
                        </ul>
                      </li>
                    );
                  }
                })}
              </ul>
            </div>
          )}
        </div>

        {/* --- Mapping Info and Export --- */}
        <div style={{ marginTop: 16, width: "100%", maxWidth: 480 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={loadMappingData}
              disabled={loadingMapping}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                borderRadius: "6px",
                background: loadingMapping ? "#ccc" : "#17a2b8",
                color: "#fff",
                border: "none",
                cursor: loadingMapping ? "not-allowed" : "pointer",
                flex: 1,
              }}
            >
              {loadingMapping ? "Loading..." : "📋 View Current Mapping"}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                borderRadius: "6px",
                background: exporting ? "#ccc" : "#6c757d",
                color: "#fff",
                border: "none",
                cursor: exporting ? "not-allowed" : "pointer",
                flex: 1,
              }}
            >
              {exporting ? "Exporting..." : "📥 Export CSV"}
            </button>
          </div>

          {/* Mapping Data Display */}
          {mappingData && (
            <div style={{ 
              border: "1px solid #ddd", 
              padding: 16, 
              borderRadius: 6,
              background: "#f8f9fa",
              marginBottom: 16
            }}>
              <h4>Current Mapping ({mappingData.productCount} products)</h4>
              <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 12 }}>
                Last updated: {new Date(mappingData.lastUpdated).toLocaleString()}
              </p>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ddd" }}>
                      <th style={{ textAlign: "left", padding: "4px" }}>Shopify SKU</th>
                      <th style={{ textAlign: "left", padding: "4px" }}>Flowtrac SKU</th>
                      <th style={{ textAlign: "left", padding: "4px" }}>Product Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingData.mapping.products.slice(0, 10).map((product: any, index: number) => (
                      <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "4px" }}>{product.shopify_sku}</td>
                        <td style={{ padding: "4px" }}>{product.flowtrac_sku}</td>
                        <td style={{ padding: "4px" }}>{product.product_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mappingData.productCount > 10 && (
                  <p style={{ fontSize: "0.8rem", color: "#666", marginTop: 8 }}>
                    Showing first 10 of {mappingData.productCount} products. Export CSV to see all.
                  </p>
                )}
              </div>
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
