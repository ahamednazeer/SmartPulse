require('dotenv').config();
const Database = require('libsql');
try {
  let urlStr = process.env.DATABASE_NAME.replace(/^"|"$/g, '');
  let authToken;
  const url = new URL(urlStr);
  if (url.searchParams.has('authToken')) {
    authToken = url.searchParams.get('authToken');
    url.searchParams.delete('authToken');
    urlStr = url.toString().replace(/\/$/, ""); 
  }
  console.log("URL:", urlStr.substring(0, 50) + "...");
  console.log("Token:", authToken.substring(0, 10) + "...");
  
  const db = new Database(urlStr, { authToken });
  const row = db.prepare('SELECT 1 as result').get();
  console.log("Row", row);
} catch(e) {
  console.error("Error!!!", e);
}
