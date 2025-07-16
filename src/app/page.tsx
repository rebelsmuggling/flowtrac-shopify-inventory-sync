'use client';

import Image from "next/image";
import styles from "./page.module.css";
import { useState } from "react";

export default function Home() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);

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
        <ol>
          <li>
            Get started by editing <code>src/app/page.tsx</code>.
          </li>
          <li>Save and see your changes instantly.</li>
        </ol>

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
        {/* --- End Sync Now Button and Feedback --- */}
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
