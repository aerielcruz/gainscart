import { MongoClient } from 'mongodb'

let client

// Pipeline scripts use the native driver directly rather than the Mongoose
// models in src/ -- they're plain Node scripts run on a schedule, separate
// from the Express app (see CLAUDE.md's Data Pipeline section).
export async function getDb() {
  if (!client) {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not set (check your .env file)')
    client = new MongoClient(uri)
    await client.connect()
  }
  return client.db()
}

export async function closeDb() {
  if (client) {
    await client.close()
    client = undefined
  }
}
