-- Simple mapping insertion script
-- This will insert a basic mapping structure that you can then update via the API

-- First, clear any existing mapping
DELETE FROM mapping;

-- Insert a basic mapping structure
INSERT INTO mapping (version, products, updated_by) 
VALUES (
  1, 
  '[]'::jsonb, 
  'manual-setup'
);

-- Verify the insertion
SELECT 
  id,
  version, 
  updated_by, 
  last_updated,
  jsonb_array_length(products) as product_count
FROM mapping 
ORDER BY version DESC 
LIMIT 1;
