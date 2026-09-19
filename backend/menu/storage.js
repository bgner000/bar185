// Menu file storage.
//
// The task asked to "prefer Supabase Storage if appropriate". This project's
// backend/.env only has DATABASE_URL (a raw Postgres connection string) --
// there is no SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY configured, and
// those are separate credentials from the database connection (Supabase
// Storage is its own REST API, not reachable over the Postgres wire
// protocol). Rather than block this whole feature on new credentials, this
// saves files to local disk and serves them from a static route, which
// satisfies every actual constraint that was given: no PDF binary in React,
// no file checked into source control, no rebuild needed to change the
// published menu.
//
// This is intentionally the only file that knows *where* menu files live.
// Swapping to Supabase Storage later (once SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY exist) means rewriting saveMenuFile() to upload
// via fetch to Supabase's Storage REST API and return its public URL --
// nothing in server.js or the frontend needs to change.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORAGE_DIR = path.join(__dirname, '..', 'uploads', 'menu');
const PUBLIC_PREFIX = '/menu-files';

fs.mkdirSync(STORAGE_DIR, { recursive: true });

const EXTENSIONS_BY_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

function saveMenuFile(buffer, mimeType) {
  const extension = EXTENSIONS_BY_MIME[mimeType];

  if (!extension) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
  const absolutePath = path.join(STORAGE_DIR, fileName);

  fs.writeFileSync(absolutePath, buffer);

  return {
    storagePath: fileName,
    publicPath: `${PUBLIC_PREFIX}/${fileName}`,
  };
}

// Removes one stored file by its storagePath (the same value saveMenuFile
// returned). Callers are responsible for confirming nothing else still
// references this path first -- this function does not check, it just
// unlinks. Missing-file is treated as success (already gone is the
// desired end state), but any other error is surfaced so a caller that
// cares can log it -- deletion here is always best-effort, never allowed
// to fail the database change that already committed around it.
function deleteMenuFile(storagePath) {
  try {
    fs.unlinkSync(path.join(STORAGE_DIR, storagePath));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

module.exports = { saveMenuFile, deleteMenuFile, STORAGE_DIR, PUBLIC_PREFIX, EXTENSIONS_BY_MIME };
