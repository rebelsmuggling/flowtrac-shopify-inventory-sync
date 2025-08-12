const { sql } = require('@vercel/postgres');

async function migrateAddBinBreakdown() {
  try {
    console.log('Starting migration to add bin_breakdown column...');
    
    // Check if the column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'flowtrac_inventory' 
      AND column_name = 'bin_breakdown'
    `;
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ bin_breakdown column already exists. Migration not needed.');
      return;
    }
    
    // Add the bin_breakdown column
    console.log('Adding bin_breakdown column to flowtrac_inventory table...');
    await sql`
      ALTER TABLE flowtrac_inventory 
      ADD COLUMN bin_breakdown JSONB
    `;
    
    console.log('✅ Successfully added bin_breakdown column to flowtrac_inventory table');
    
    // Update existing records to have empty bin_breakdown
    console.log('Updating existing records with empty bin_breakdown...');
    const updateResult = await sql`
      UPDATE flowtrac_inventory 
      SET bin_breakdown = '{}'::jsonb 
      WHERE bin_breakdown IS NULL
    `;
    
    console.log(`✅ Updated ${updateResult.rowCount} existing records`);
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run the migration
migrateAddBinBreakdown()
  .then(() => {
    console.log('Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
