-- Create mapping table for storing the mapping.json data
CREATE TABLE IF NOT EXISTS mapping (
  id SERIAL PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  products JSONB NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by VARCHAR(100) DEFAULT 'system'
);

-- Create flowtrac_product_ids table for persistent storage of product IDs
CREATE TABLE IF NOT EXISTS flowtrac_product_ids (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source VARCHAR(50) NOT NULL DEFAULT 'flowtrac_api'
);

-- Create sync_sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS sync_sessions (
  session_id VARCHAR(100) PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_skus INTEGER NOT NULL DEFAULT 0,
  current_batch INTEGER NOT NULL DEFAULT 1,
  total_batches INTEGER NOT NULL DEFAULT 1,
  processed_skus INTEGER NOT NULL DEFAULT 0,
  remaining_skus INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 120,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error_message TEXT
);

-- Create batch_results table if it doesn't exist
CREATE TABLE IF NOT EXISTS batch_results (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  batch_number INTEGER NOT NULL,
  successful INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  processing_time_ms INTEGER NOT NULL DEFAULT 0,
  failed_skus TEXT[],
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES sync_sessions(session_id) ON DELETE CASCADE
);

-- Create flowtrac_inventory table if it doesn't exist
CREATE TABLE IF NOT EXISTS flowtrac_inventory (
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  warehouse VARCHAR(50) NOT NULL DEFAULT 'Manteca',
  bins TEXT[],
  bin_breakdown JSONB,
  source VARCHAR(50) NOT NULL DEFAULT 'flowtrac_api',
  batch_id VARCHAR(100),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (sku, warehouse)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_flowtrac_inventory_sku ON flowtrac_inventory(sku);
CREATE INDEX IF NOT EXISTS idx_flowtrac_inventory_warehouse ON flowtrac_inventory(warehouse);
CREATE INDEX IF NOT EXISTS idx_flowtrac_inventory_last_updated ON flowtrac_inventory(last_updated);
CREATE INDEX IF NOT EXISTS idx_sync_sessions_status ON sync_sessions(status);
CREATE INDEX IF NOT EXISTS idx_batch_results_session_id ON batch_results(session_id);

-- Ensure bin_breakdown column exists (for existing tables)
ALTER TABLE flowtrac_inventory ADD COLUMN IF NOT EXISTS bin_breakdown JSONB;

-- Verify tables were created
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('mapping', 'flowtrac_product_ids', 'sync_sessions', 'batch_results', 'flowtrac_inventory');
