import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export interface FlowtracInventoryRecord {
  id?: number;
  sku: string;
  quantity: number;
  warehouse: string;
  bins?: string[];
  bin_breakdown?: Record<string, number>;
  last_updated: Date;
  source: 'flowtrac_api' | 'manual_override';
  batch_id?: string;
}

export interface SyncSession {
  id?: number;
  session_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  total_skus: number;
  current_batch: number;
  total_batches: number;
  processed_skus: number;
  remaining_skus: number;
  batch_size: number;
  started_at: Date;
  last_updated: Date;
  completed_at?: Date;
  error_message?: string;
}

export interface BatchResult {
  id?: number;
  session_id: string;
  batch_number: number;
  skus_processed: number;
  successful: number;
  failed: number;
  failed_skus: string[];
  processing_time_ms: number;
  completed_at: Date;
  error_message?: string;
}

// Initialize database tables
export async function initializeDatabase() {
  try {
    // Create flowtrac_inventory table
    await sql`
      CREATE TABLE IF NOT EXISTS flowtrac_inventory (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        warehouse VARCHAR(100) NOT NULL DEFAULT 'Manteca',
        bins TEXT[],
        bin_breakdown JSONB,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        source VARCHAR(50) NOT NULL DEFAULT 'flowtrac_api',
        batch_id VARCHAR(100),
        UNIQUE(sku, warehouse)
      )
    `;

    // Create sync_sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sync_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        total_skus INTEGER NOT NULL,
        current_batch INTEGER NOT NULL DEFAULT 1,
        total_batches INTEGER NOT NULL,
        processed_skus INTEGER NOT NULL DEFAULT 0,
        remaining_skus INTEGER NOT NULL,
        batch_size INTEGER NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT
      )
    `;

    // Create batch_results table
    await sql`
      CREATE TABLE IF NOT EXISTS batch_results (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        batch_number INTEGER NOT NULL,
        skus_processed INTEGER NOT NULL,
        successful INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        failed_skus TEXT[],
        processing_time_ms INTEGER NOT NULL,
        completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        error_message TEXT,
        FOREIGN KEY (session_id) REFERENCES sync_sessions(session_id) ON DELETE CASCADE
      )
    `;

    // Create flowtrac_product_ids table for persistent storage of product IDs
    await sql`
      CREATE TABLE IF NOT EXISTS flowtrac_product_ids (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100) UNIQUE NOT NULL,
        product_id VARCHAR(100) NOT NULL,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        source VARCHAR(50) NOT NULL DEFAULT 'flowtrac_api'
      )
    `;

    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_flowtrac_inventory_sku ON flowtrac_inventory(sku)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_flowtrac_inventory_warehouse ON flowtrac_inventory(warehouse)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_flowtrac_inventory_last_updated ON flowtrac_inventory(last_updated)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sync_sessions_status ON sync_sessions(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_batch_results_session_id ON batch_results(session_id)`;

    console.log('Database initialized successfully');
    
    // Ensure bin_breakdown column exists (for existing tables)
    try {
      await sql`ALTER TABLE flowtrac_inventory ADD COLUMN IF NOT EXISTS bin_breakdown JSONB`;
      console.log('Ensured bin_breakdown column exists');
    } catch (error) {
      console.log('bin_breakdown column already exists or error adding it:', error);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Database initialization error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Flowtrac Inventory Operations
export async function upsertFlowtracInventory(records: FlowtracInventoryRecord[]) {
  try {
    const values = records.map(record => {
      // Convert bins array to PostgreSQL array format
      const binsArray = record.bins && record.bins.length > 0 
        ? `ARRAY[${record.bins.map(bin => `'${bin}'`).join(', ')}]`
        : 'ARRAY[]::text[]';
      
      // Convert bin_breakdown to JSON string
      const binBreakdownJson = record.bin_breakdown ? `'${JSON.stringify(record.bin_breakdown)}'` : 'NULL';
      
      return `('${record.sku}', ${record.quantity}, '${record.warehouse}', ${binsArray}, ${binBreakdownJson}, '${record.source}', '${record.batch_id || ''}', NOW())`;
    }).join(', ');

    const query = `
      INSERT INTO flowtrac_inventory (sku, quantity, warehouse, bins, bin_breakdown, source, batch_id, last_updated)
      VALUES ${values}
      ON CONFLICT (sku, warehouse) 
      DO UPDATE SET 
        quantity = EXCLUDED.quantity,
        bins = EXCLUDED.bins,
        bin_breakdown = EXCLUDED.bin_breakdown,
        last_updated = NOW(),
        source = EXCLUDED.source,
        batch_id = EXCLUDED.batch_id
    `;

    await sql.query(query);
    return { success: true, recordsUpdated: records.length };
  } catch (error) {
    console.error('Error upserting Flowtrac inventory:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getFlowtracInventory(skus?: string[], warehouse?: string) {
  try {
    let query = 'SELECT * FROM flowtrac_inventory';
    const conditions = [];
    const params = [];

    if (skus && skus.length > 0) {
      conditions.push(`sku = ANY($${params.length + 1})`);
      params.push(skus);
    }

    if (warehouse) {
      conditions.push(`warehouse = $${params.length + 1}`);
      params.push(warehouse);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY last_updated DESC';

    const result = await sql.query(query, params);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error('Error getting Flowtrac inventory:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getInventorySummary() {
  try {
    const result = await sql`
      SELECT 
        COUNT(*) as total_skus,
        SUM(quantity) as total_quantity,
        warehouse,
        COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN quantity > 0 AND quantity <= 10 THEN 1 END) as low_stock
      FROM flowtrac_inventory 
      GROUP BY warehouse
      ORDER BY warehouse
    `;

    return { success: true, data: result.rows };
  } catch (error) {
    console.error('Error getting inventory summary:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Sync Session Operations
export async function createSyncSession(session: Omit<SyncSession, 'id'>) {
  try {
    const result = await sql`
      INSERT INTO sync_sessions (
        session_id, status, total_skus, current_batch, total_batches, 
        processed_skus, remaining_skus, batch_size, started_at, last_updated
      ) VALUES (
        ${session.session_id}, ${session.status}, ${session.total_skus}, 
        ${session.current_batch}, ${session.total_batches}, ${session.processed_skus}, 
        ${session.remaining_skus}, ${session.batch_size}, ${session.started_at.toISOString()}, ${session.last_updated.toISOString()}
      ) RETURNING *
    `;

    return { success: true, data: result.rows[0] };
  } catch (error) {
    console.error('Error creating sync session:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function updateSyncSession(sessionId: string, updates: Partial<SyncSession>) {
  try {
    // Filter out id, session_id, and last_updated from the updates
    const filteredUpdates = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'session_id' && key !== 'last_updated')
      .reduce((obj, key) => {
        (obj as any)[key] = (updates as any)[key];
        return obj;
      }, {} as Partial<SyncSession>);

    const setClause = Object.keys(filteredUpdates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(filteredUpdates);

    const query = `
      UPDATE sync_sessions 
      SET ${setClause}, last_updated = NOW()
      WHERE session_id = $1
      RETURNING *
    `;

    const result = await sql.query(query, [sessionId, ...values]);
    return { success: true, data: result.rows[0] };
  } catch (error) {
    console.error('Error updating sync session:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getSyncSession(sessionId?: string) {
  try {
    if (sessionId) {
      // Get specific session
      const result = await sql`
        SELECT * FROM sync_sessions WHERE session_id = ${sessionId}
      `;
      return { success: true, data: result.rows[0] || null };
    } else {
      // Get the most recent active session
      const result = await sql`
        SELECT * FROM sync_sessions 
        WHERE status IN ('pending', 'in_progress')
        ORDER BY started_at DESC 
        LIMIT 1
      `;
      return { success: true, data: result.rows[0] || null };
    }
  } catch (error) {
    console.error('Error getting sync session:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteSyncSession(sessionId: string) {
  try {
    const result = await sql`
      DELETE FROM sync_sessions WHERE session_id = ${sessionId}
    `;
    return { success: true, deletedCount: result.rowCount };
  } catch (error) {
    console.error('Error deleting sync session:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getActiveSyncSessions() {
  try {
    const result = await sql`
      SELECT * FROM sync_sessions 
      WHERE status IN ('pending', 'in_progress')
      ORDER BY started_at DESC
    `;

    return { success: true, data: result.rows };
  } catch (error) {
    console.error('Error getting active sync sessions:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Batch Result Operations
export async function createBatchResult(result: Omit<BatchResult, 'id'>) {
  try {
    const query = `
      INSERT INTO batch_results (
        session_id, batch_number, skus_processed, successful, failed, 
        failed_skus, processing_time_ms, completed_at, error_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *
    `;
    
    const values = [
      result.session_id,
      result.batch_number,
      result.skus_processed,
      result.successful,
      result.failed,
      result.failed_skus,
      result.processing_time_ms,
      result.completed_at.toISOString(),
      result.error_message || null
    ];

    const dbResult = await sql.query(query, values);
    return { success: true, data: dbResult.rows[0] };
  } catch (error) {
    console.error('Error creating batch result:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getBatchResults(sessionId: string) {
  try {
    const result = await sql`
      SELECT * FROM batch_results 
      WHERE session_id = ${sessionId}
      ORDER BY batch_number ASC
    `;

    return { success: true, data: result.rows };
  } catch (error) {
    console.error('Error getting batch results:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Utility functions
export async function clearOldSessions(daysOld: number = 7) {
  try {
    const result = await sql`
      DELETE FROM sync_sessions 
      WHERE completed_at < NOW() - INTERVAL '${daysOld} days'
      AND status IN ('completed', 'failed')
    `;

    return { success: true, deletedCount: result.rowCount };
  } catch (error) {
    console.error('Error clearing old sessions:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getFlowtracProductId(sku: string) {
  try {
    const result = await sql`
      SELECT product_id FROM flowtrac_product_ids WHERE sku = ${sku}
    `;
    return { success: true, data: result.rows[0]?.product_id || null };
  } catch (error) {
    console.error('Error getting Flowtrac product ID:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function setFlowtracProductId(sku: string, productId: string) {
  try {
    const result = await sql`
      INSERT INTO flowtrac_product_ids (sku, product_id)
      VALUES (${sku}, ${productId})
      ON CONFLICT (sku) 
      DO UPDATE SET 
        product_id = EXCLUDED.product_id,
        last_updated = NOW()
      RETURNING product_id
    `;
    return { success: true, data: result.rows[0]?.product_id };
  } catch (error) {
    console.error('Error setting Flowtrac product ID:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getFlowtracProductIds(skus: string[]) {
  try {
    if (skus.length === 0) {
      return { success: true, data: {} };
    }
    
    const placeholders = skus.map((_, index) => `$${index + 1}`).join(',');
    const query = `SELECT sku, product_id FROM flowtrac_product_ids WHERE sku IN (${placeholders})`;
    const result = await sql.query(query, skus);
    
    const productIds: Record<string, string> = {};
    for (const row of result.rows) {
      productIds[row.sku] = row.product_id;
    }
    
    return { success: true, data: productIds };
  } catch (error) {
    console.error('Error getting Flowtrac product IDs:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function clearOldInventoryRecords(skusToKeep: string[]) {
  try {
    if (skusToKeep.length === 0) {
      // If no SKUs to keep, clear all records
      const result = await sql`DELETE FROM flowtrac_inventory`;
      return { success: true, deletedCount: result.rowCount };
    }

    // Delete records for SKUs not in the keep list
    const placeholders = skusToKeep.map((_, index) => `$${index + 1}`).join(',');
    const query = `DELETE FROM flowtrac_inventory WHERE sku NOT IN (${placeholders})`;
    const result = await sql.query(query, skusToKeep);

    return { success: true, deletedCount: result.rowCount };
  } catch (error) {
    console.error('Error clearing old inventory records:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getDatabaseStats() {
  try {
    const inventoryStats = await sql`
      SELECT 
        COUNT(*) as total_inventory_records,
        COUNT(DISTINCT sku) as unique_skus,
        COUNT(DISTINCT warehouse) as unique_warehouses,
        MAX(last_updated) as last_inventory_update
      FROM flowtrac_inventory
    `;

    const sessionStats = await sql`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_sessions,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as active_sessions
      FROM sync_sessions
    `;

    return { 
      success: true, 
      inventory: inventoryStats.rows[0],
      sessions: sessionStats.rows[0]
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return { success: false, error: (error as Error).message };
  }
} 