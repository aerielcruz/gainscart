/**
 * 7-sync-nutrition-to-mongo.js
 *
 * Copies nutrition_cache from the local DuckDB file into a MongoDB
 * collection, so your Next.js/Express app can query nutrition data
 * without needing DuckDB at runtime.
 *
 * Upserts by barcode, so it's safe to re-run this anytime after
 * 6-fetch-all-nutrition.js has made progress -- it'll just update/add
 * records, not duplicate them.
 *
 * Requires: MONGODB_URI environment variable set to your connection string.
 *   e.g. export MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/dbname"
 *
 * Usage: node 7-sync-nutrition-to-mongo.js
 */

require('dotenv').config();

const { DuckDBInstance } = require('@duckdb/node-api');
const { MongoClient } = require('mongodb');

const LOCAL_DB = './base_v3.duckdb';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'grocer_optimiser'; // TODO: adjust to your actual db name
const COLLECTION_NAME = 'nutrition_facts';
const BATCH_SIZE = 1000;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable. Set it before running:');
  console.error('  export MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/dbname"');
  process.exit(1);
}

async function main() {
  // --- Read from DuckDB ---
  const instance = await DuckDBInstance.create(LOCAL_DB);
  const connection = await instance.connect();

  const result = await connection.run(`
    SELECT barcode, product_id, protein_100g, energy_kj_100g, off_product_name, found, fetched_at
    FROM nutrition_cache
    WHERE found = true;
  `);
  const rows = await result.getRowObjects();

  console.log(`Read ${rows.length} matched nutrition records from DuckDB.`);

  if (rows.length === 0) {
    console.log('Nothing to sync yet -- run 6-fetch-all-nutrition.js first (or let it finish).');
    return;
  }

  // --- Write to MongoDB ---
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Ensure fast lookups by barcode and product_id from your app later
    await collection.createIndex({ barcode: 1 }, { unique: true });
    await collection.createIndex({ product_id: 1 });

    let synced = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const operations = batch.map((row) => ({
        updateOne: {
          filter: { barcode: row.barcode },
          update: {
            $set: {
              barcode: row.barcode,
              product_id: row.product_id,
              protein_100g: row.protein_100g,
              energy_kj_100g: row.energy_kj_100g,
              off_product_name: row.off_product_name,
              source: 'openfoodfacts',
              synced_at: new Date(),
            },
          },
          upsert: true,
        },
      }));

      const res = await collection.bulkWrite(operations);
      synced += res.upsertedCount + res.modifiedCount;
      console.log(`Synced batch ${i / BATCH_SIZE + 1}: ${batch.length} records (running total: ${synced})`);
    }

    console.log(`\nDone. ${rows.length} nutrition records synced to MongoDB collection "${COLLECTION_NAME}" in db "${DB_NAME}".`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});