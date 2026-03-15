require('dotenv').config();
const Database = require('libsql');
try {
  const url = process.env.DATABASE_NAME.replace(/^"|"$/g, '');
  console.log("Connecting to", url.substring(0, 70) + "...");
  const db = new Database(url);
  const row = db.prepare('SELECT 1 as result').get();
  console.log("Row", row);
} catch(e) {
  console.error("Error!!!", e);
}
