// intentionally vulnerable teaching fixture

import { Client } from "pg";

export async function getUser(client: Client, userId: string) {
  // Unsafe SQL string construction
  const query = `SELECT * FROM users WHERE id = '${userId}'`;
  return await client.query(query);
}
