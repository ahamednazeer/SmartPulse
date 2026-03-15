require('dotenv').config();
const Database = require('libsql');
try {
  let url = process.env.DATABASE_NAME;
  if (url.startsWith('"') && url.endsWith('"')) {
    url = url.slice(1, -1);
  }
  console.log("Connecting to:", url.substring(0, 50) + "...");
  const db = new Database(url);
  console.log("Successfully created database instance");
  const row = db.prepare('SELECT 1 as result').get();
  console.log("Row", row);
} catch(e) {
  console.error("Error!!!", e);
}
