import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { DuckDBInstance } from '@duckdb/node-api'

const brotliDecompress = promisify(zlib.brotliDecompress)

const BASE_URL = 'https://assets-prod.grocer.nz/public/base_v3.duckdb.br'
const CACHE_DIR = path.resolve(import.meta.dirname, '../.cache')
const LOCAL_DB_PATH = path.join(CACHE_DIR, 'base_v3.duckdb')

// Node's fetch() may transparently Brotli-decompress the response body if
// it honors the Content-Encoding header, even though the filename still
// says `.br` -- so we can't assume we need to decompress ourselves. Check
// for DuckDB's own magic bytes first. DuckDB's file header is 8 bytes of
// checksum followed by the "DUCK" magic at offset 8 (not offset 0).
function isDuckDbFile(buffer) {
  return buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'DUCK'
}

export async function downloadBaseCatalog() {
  console.log(`Downloading ${BASE_URL} ...`)
  const res = await fetch(BASE_URL)
  if (!res.ok) throw new Error(`Failed to download base catalog: HTTP ${res.status}`)

  const raw = Buffer.from(await res.arrayBuffer())
  const dbBuffer = isDuckDbFile(raw) ? raw : await brotliDecompress(raw)

  if (!isDuckDbFile(dbBuffer)) {
    throw new Error(
      'Downloaded file is not a valid DuckDB file (missing DUCK magic bytes), even after Brotli decompression'
    )
  }

  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(LOCAL_DB_PATH, dbBuffer)
  console.log(`Saved to ${LOCAL_DB_PATH} (${dbBuffer.length} bytes)`)
  return LOCAL_DB_PATH
}

export async function openConnection(dbPath = LOCAL_DB_PATH) {
  const instance = await DuckDBInstance.create(dbPath)
  return instance.connect()
}

// In-memory instance purely for querying remote parquet files via httpfs --
// no local catalog file needed for price syncing.
export async function openHttpConnection() {
  const instance = await DuckDBInstance.create(':memory:')
  const connection = await instance.connect()
  await connection.run('INSTALL httpfs;')
  await connection.run('LOAD httpfs;')
  return connection
}

export async function runQuery(connection, sql) {
  const result = await connection.run(sql)
  return result.getRowObjects()
}
