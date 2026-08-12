const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// database.js (and debugLogger.js, which it requires) both do
// `const { app } = require("electron")` for app.getPath("userData"). Outside
// the Electron runtime, node's own "electron" package export is just a path
// string, so we seed require's module cache with a minimal stub before the
// first require — same trick, no real Electron needed.
const electronStubPath = require.resolve("electron");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhwani-db-test-"));
require.cache[electronStubPath] = {
  id: electronStubPath,
  filename: electronStubPath,
  loaded: true,
  exports: {
    app: {
      getPath: () => tmpDir,
      isReady: () => false,
    },
  },
};

// better-sqlite3's prebuilt native binary in this checkout is compiled
// against Electron's Node ABI, not the plain Node used to run `node --test`.
// Skip gracefully rather than failing the whole run when that mismatch shows
// up (e.g. a fresh worktree that hasn't run electron-rebuild).
const DatabaseManager = require("../../src/helpers/database.js");
let probeDb = null;
let loadError = null;
try {
  probeDb = new DatabaseManager();
} catch (error) {
  loadError = error;
}

test(
  "getRecentNotesForParticipants finds notes by attendee email, most recent first, respecting limit",
  { skip: loadError ? `better-sqlite3 native binary unavailable under plain node: ${loadError.message}` : false },
  () => {
    const db = probeDb;

    const alice = { email: "alice@example.com", displayName: "Alice" };
    const bob = { email: "bob@example.com", displayName: "Bob" };
    const carol = { email: "carol@example.com", displayName: "Carol" };

    const withAlice1 = db.saveNote("Kickoff with Alice", "", "meeting").note;
    db.updateNote(withAlice1.id, { participants: JSON.stringify([alice]) });

    const withAliceAndBob = db.saveNote("Follow-up with Alice and Bob", "", "meeting").note;
    db.updateNote(withAliceAndBob.id, { participants: JSON.stringify([alice, bob]) });

    const withCarolOnly = db.saveNote("1:1 with Carol", "", "meeting").note;
    db.updateNote(withCarolOnly.id, { participants: JSON.stringify([carol]) });

    db.saveNote("Solo scratch note", "", "personal");

    // Matches both Alice-tagged notes, most recently updated first.
    const forAlice = db.getRecentNotesForParticipants(["alice@example.com"]);
    assert.deepEqual(
      forAlice.map((n) => n.id),
      [withAliceAndBob.id, withAlice1.id]
    );

    // Case-insensitive, and matches on any of several emails.
    const forBobUppercase = db.getRecentNotesForParticipants(["BOB@example.com"]);
    assert.deepEqual(
      forBobUppercase.map((n) => n.id),
      [withAliceAndBob.id]
    );

    // Unrelated attendee finds nothing.
    assert.deepEqual(db.getRecentNotesForParticipants(["nobody@example.com"]), []);

    // Empty/missing email list short-circuits without querying.
    assert.deepEqual(db.getRecentNotesForParticipants([]), []);
    assert.deepEqual(db.getRecentNotesForParticipants(undefined), []);

    // limit is honored.
    const limited = db.getRecentNotesForParticipants(
      ["alice@example.com", "bob@example.com", "carol@example.com"],
      1
    );
    assert.equal(limited.length, 1);
  }
);
